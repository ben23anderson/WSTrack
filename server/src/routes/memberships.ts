import { Router } from 'express';
import { Prisma } from '@prisma/client';
import db from '../lib/db.js';
import { config } from '../config.js';
import { requireAuth, requireHeadCoach } from '../middleware/requireAuth.js';
import { InviteUserSchema, UpdatePermissionsSchema } from '../lib/validation.js';
import { SmtpEmailProvider } from '../lib/email/SmtpEmailProvider.js';

const router = Router({ mergeParams: true });

const emailProvider = new SmtpEmailProvider(config.EMAIL_FROM, {
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  user: config.SMTP_USER,
  pass: config.SMTP_PASS,
});

// POST /api/teams/:teamId/invite — head coach only
router.post(
  '/invite',
  requireAuth,
  requireHeadCoach('teamId'),
  async (req, res): Promise<void> => {
    const { teamId } = req.params;
    const parsed = InviteUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const { email, role, permissions } = parsed.data;

    try {
      const team = await db.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, divisionId: true },
      });
      if (!team) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invite = await db.invite.create({
        data: {
          email,
          role,
          teamId,
          divisionId: team.divisionId,
          permissions: permissions !== undefined ? (permissions as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          expiresAt,
        },
      });

      const acceptUrl = `${config.APP_BASE_URL}/invites/${invite.token}`;

      try {
        await emailProvider.send({
          to: email,
          subject: `You're invited to join ${team.name} on WSTrack`,
          html: `
            <p>You've been invited to join <strong>${team.name}</strong> as a <strong>${role.replace('_', ' ')}</strong>.</p>
            <p><a href="${acceptUrl}">Accept Invitation</a></p>
            <p>This invite expires in 7 days.</p>
            <p>If you cannot click the link, copy this URL: ${acceptUrl}</p>
          `,
          text: `You've been invited to join ${team.name} as a ${role.replace('_', ' ')}.\n\nAccept: ${acceptUrl}\n\nThis invite expires in 7 days.`,
        });
      } catch {
        // Email send failure should not block invite creation
        console.error('Failed to send invite email');
      }

      res.status(201).json({
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        },
      });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/teams/:teamId/members — head coach only
router.get(
  '/members',
  requireAuth,
  requireHeadCoach('teamId'),
  async (req, res): Promise<void> => {
    const { teamId } = req.params;

    try {
      const members = await db.membership.findMany({
        where: { teamId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      res.json({ members });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PATCH /api/teams/:teamId/members/:membershipId — head coach; update permissions
router.patch(
  '/members/:membershipId',
  requireAuth,
  requireHeadCoach('teamId'),
  async (req, res): Promise<void> => {
    const { teamId, membershipId } = req.params;
    const parsed = UpdatePermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const { permissions } = parsed.data;

    try {
      const existing = await db.membership.findFirst({
        where: { id: membershipId, teamId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Membership not found' });
        return;
      }
      if (existing.role !== 'assistant_coach') {
        res.status(400).json({ error: 'Permissions can only be set for assistant coaches' });
        return;
      }

      const membership = await db.membership.update({
        where: { id: membershipId },
        data: { permissions },
      });

      res.json({ membership });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/teams/:teamId/members/:membershipId — head coach; remove membership
router.delete(
  '/members/:membershipId',
  requireAuth,
  requireHeadCoach('teamId'),
  async (req, res): Promise<void> => {
    const { teamId, membershipId } = req.params;

    try {
      const existing = await db.membership.findFirst({
        where: { id: membershipId, teamId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Membership not found' });
        return;
      }

      await db.membership.delete({ where: { id: membershipId } });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
