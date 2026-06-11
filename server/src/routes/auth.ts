import { Router } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import db from '../lib/db.js';
import { loginLimiter } from '../lib/rateLimiter.js';
import { SignupSchema, LoginSchema } from '../lib/validation.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SmtpEmailProvider } from '../lib/email/SmtpEmailProvider.js';
import { config } from '../config.js';

const router = Router();

const emailProvider = new SmtpEmailProvider(config.EMAIL_FROM, {
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  user: config.SMTP_USER,
  pass: config.SMTP_PASS,
});

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
  const url = `${config.APP_BASE_URL}/verify-email/${token}`;
  await emailProvider.send({
    to: email,
    subject: 'Verify your WSTrack email',
    html: `
      <p>Hi ${name},</p>
      <p>Please verify your email address to activate your WSTrack account:</p>
      <p><a href="${url}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a></p>
      <p>Or copy this link: ${url}</p>
      <p>This link expires in 24 hours.</p>
    `,
    text: `Hi ${name},\n\nVerify your WSTrack email: ${url}\n\nThis link expires in 24 hours.`,
  });
}

async function sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
  const url = `${config.APP_BASE_URL}/reset-password/${token}`;
  await emailProvider.send({
    to: email,
    subject: 'Reset your WSTrack password',
    html: `
      <p>Hi ${name},</p>
      <p>You requested a password reset for your WSTrack account:</p>
      <p><a href="${url}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p>
      <p>Or copy this link: ${url}</p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
    text: `Hi ${name},\n\nReset your WSTrack password: ${url}\n\nThis link expires in 1 hour.`,
  });
}

// POST /api/auth/signup
router.post('/signup', loginLimiter, async (req, res): Promise<void> => {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    return;
  }
  const { name, email, password } = parsed.data;
  const inviteToken: string | undefined = typeof req.body.invite_token === 'string' ? req.body.invite_token : undefined;

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    // If invite_token provided, validate it before creating user
    let invite: Awaited<ReturnType<typeof db.invite.findUnique>> | null = null;
    if (inviteToken) {
      invite = await db.invite.findUnique({ where: { token: inviteToken } });
      if (!invite || invite.acceptedAt !== null || invite.expiresAt < new Date()) {
        res.status(400).json({ error: 'Invite link is invalid or expired' });
        return;
      }
    }

    const passwordHash = await argon2.hash(password);
    const verificationToken = inviteToken ? null : generateToken();
    const emailVerified = !!inviteToken;

    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, passwordHash, emailVerified, verificationToken },
      });
      if (invite) {
        await tx.membership.create({
          data: {
            userId: newUser.id,
            role: invite.role,
            teamId: invite.teamId ?? undefined,
            divisionId: invite.divisionId ?? undefined,
            permissions: invite.permissions as never ?? undefined,
          },
        });
        await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      }
      return newUser;
    });

    if (emailVerified) {
      // Invite-based signup: log in immediately
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
      res.status(201).json({
        user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
        teamId: invite?.teamId ?? null,
      });
    } else {
      // Regular signup: send verification email, don't log in
      try {
        await sendVerificationEmail(email, name, verificationToken!);
      } catch (err) {
        console.error('[signup] Failed to send verification email:', err);
      }
      res.status(201).json({ requiresVerification: true });
    }
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    return;
  }
  const { email, password } = parsed.data;

  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({ error: 'Please verify your email before signing in.', unverified: true });
      return;
    }

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );

    res.json({ user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } });
  } catch (err) {
    console.error('[login error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res): void => {
  req.session.destroy((err) => {
    if (err) { res.status(500).json({ error: 'Failed to logout' }); return; }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res): Promise<void> => {
  console.log('[/me] session userId:', req.session.userId);
  try {
    const user = await db.user.findUnique({ where: { id: req.session.userId } });
    if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const memberships = await db.membership.findMany({
      where: { userId: user.id },
      include: {
        team: { select: { id: true, name: true, divisionId: true } },
        division: { select: { id: true, name: true } },
      },
    });

    res.json({
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      memberships,
    });
  } catch (err) {
    console.error('[/me error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/verify-email/:token
router.get('/verify-email/:token', async (req, res): Promise<void> => {
  const { token } = req.params;
  try {
    const user = await db.user.findUnique({ where: { verificationToken: token } });
    if (!user) { res.status(400).json({ error: 'Invalid or expired verification link.' }); return; }

    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });

    // Log the user in
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', loginLimiter, async (req, res): Promise<void> => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) { res.status(400).json({ error: 'Email required' }); return; }
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) {
      // Don't reveal whether email exists
      res.json({ ok: true }); return;
    }
    const token = generateToken();
    await db.user.update({ where: { id: user.id }, data: { verificationToken: token } });
    try { await sendVerificationEmail(email, user.name, token); } catch (err) { console.error('[resend-verification] email error:', err); }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', loginLimiter, async (req, res): Promise<void> => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) { res.status(400).json({ error: 'Email required' }); return; }
  // Always respond success to avoid email enumeration
  res.json({ ok: true });
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.emailVerified) return;
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await db.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });
    await sendPasswordResetEmail(email, user.name, token);
  } catch (err) {
    console.error('[forgot-password] error:', err);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', loginLimiter, async (req, res): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password || password.length < 8) {
    res.status(400).json({ error: 'Valid token and password (min 8 chars) required' }); return;
  }
  try {
    const resetToken = await db.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: 'Reset link is invalid or has expired.' }); return;
    }
    const passwordHash = await argon2.hash(password);
    await db.$transaction([
      db.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      db.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
