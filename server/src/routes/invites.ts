import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// POST /api/invites/:token/accept — any authenticated user
router.post('/:token/accept', requireAuth, async (req, res): Promise<void> => {
  const { token } = req.params;

  try {
    const invite = await db.invite.findUnique({ where: { token } });
    if (!invite) {
      res.status(404).json({ error: 'Invite not found or already used' });
      return;
    }
    if (invite.acceptedAt) {
      res.status(409).json({ error: 'Invite has already been accepted' });
      return;
    }
    if (invite.expiresAt < new Date()) {
      res.status(410).json({ error: 'Invite has expired' });
      return;
    }

    const membership = await db.$transaction(async (tx) => {
      const newMembership = await tx.membership.create({
        data: {
          userId: req.session.userId!,
          role: invite.role,
          teamId: invite.teamId ?? undefined,
          divisionId: invite.divisionId ?? undefined,
          permissions: invite.permissions ?? undefined,
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return newMembership;
    });

    res.status(201).json({ membership, teamId: invite.teamId });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
