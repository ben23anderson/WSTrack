import { Router } from 'express';
import argon2 from 'argon2';
import db from '../lib/db.js';
import { loginLimiter } from '../lib/rateLimiter.js';
import { SignupSchema, LoginSchema } from '../lib/validation.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// POST /api/auth/signup
router.post('/signup', loginLimiter, async (req, res): Promise<void> => {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    return;
  }
  const { name, email, password } = parsed.data;

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }

    const passwordHash = await argon2.hash(password);

    // Create user inside a transaction with a default league + division
    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, passwordHash },
      });
      return newUser;
    });

    req.session.userId = user.id;

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
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

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('[login error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res): Promise<void> => {
  console.log('[/me] session userId:', req.session.userId);
  try {
    const user = await db.user.findUnique({
      where: { id: req.session.userId },
    });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const memberships = await db.membership.findMany({
      where: { userId: user.id },
      include: {
        team: { select: { id: true, name: true } },
        division: { select: { id: true, name: true } },
      },
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      memberships,
    });
  } catch (err) {
    console.error('[/me error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
