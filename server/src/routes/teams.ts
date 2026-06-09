import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// GET /api/teams/:teamId — any member
router.get('/:teamId', requireAuth, async (req, res): Promise<void> => {
  const { teamId } = req.params;

  try {
    // Check user is a member of this team or coordinator of the team's division
    const membership = await db.membership.findFirst({
      where: {
        userId: req.session.userId!,
        OR: [
          { teamId },
          { division: { teams: { some: { id: teamId } } }, role: 'coordinator' },
        ],
      },
    });

    if (!membership) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const team = await db.team.findUnique({
      where: { id: teamId },
      include: {
        division: { select: { id: true, name: true, leagueId: true } },
      },
    });

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json({ team });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/teams/:teamId — head coach or coordinator
router.patch('/:teamId', requireAuth, async (req, res): Promise<void> => {
  const { teamId } = req.params;

  try {
    // Must be head coach OR coordinator of the team's division
    const headCoachMembership = await db.membership.findFirst({
      where: {
        userId: req.session.userId!,
        role: 'head_coach',
        teamId,
      },
    });

    if (!headCoachMembership) {
      // Check if coordinator
      const team = await db.team.findUnique({ where: { id: teamId }, select: { divisionId: true } });
      if (!team) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      const coordinatorMembership = await db.membership.findFirst({
        where: {
          userId: req.session.userId!,
          role: 'coordinator',
          divisionId: team.divisionId,
        },
      });
      if (!coordinatorMembership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const { name } = req.body as { name?: string };
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const team = await db.team.update({
      where: { id: teamId },
      data: { name: name.trim() },
    });

    res.json({ team });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
