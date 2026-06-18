import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth, requireSystemAdmin } from '../middleware/requireAuth.js';
import { CreateLeagueSchema } from '../lib/validation.js';

const router = Router();

// POST /api/leagues — create a league + initial division + coordinator membership
router.post('/', requireAuth, requireSystemAdmin, async (req, res): Promise<void> => {
  const parsed = CreateLeagueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    return;
  }
  const { leagueName, divisionName } = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const league = await tx.league.create({
        data: { name: leagueName },
      });

      const division = await tx.division.create({
        data: { name: divisionName, leagueId: league.id },
      });

      const membership = await tx.membership.create({
        data: {
          userId: req.session.userId!,
          role: 'coordinator',
          divisionId: division.id,
        },
      });

      return { league, division, membership };
    });

    res.status(201).json({
      league: { id: result.league.id, name: result.league.name },
      division: { id: result.division.id, name: result.division.name },
      membership: { id: result.membership.id },
    });
  } catch (err) {
    console.error('POST /api/leagues error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
