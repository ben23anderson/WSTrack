import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth, requireCoordinator } from '../middleware/requireAuth.js';
import { CreateDivisionSchema, CreateTeamSchema } from '../lib/validation.js';

const router = Router();

// POST /api/divisions — create a new division (coordinator or bootstrap)
router.post('/', requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateDivisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    return;
  }
  const { name, leagueId } = parsed.data;

  try {
    // Check user is a coordinator in this league (via any division in that league),
    // OR is bootstrapping (no divisions yet in this league).
    const existingDivisions = await db.division.findMany({
      where: { leagueId, deletedAt: null },
    });

    const isBootstrap = existingDivisions.length === 0;

    if (!isBootstrap) {
      // Must be a coordinator of at least one division in the league
      const coordinatorMembership = await db.membership.findFirst({
        where: {
          userId: req.session.userId!,
          role: 'coordinator',
          division: { leagueId },
        },
      });
      if (!coordinatorMembership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    // Verify league exists
    const league = await db.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      res.status(404).json({ error: 'League not found' });
      return;
    }

    const division = await db.$transaction(async (tx) => {
      const newDivision = await tx.division.create({
        data: { name, leagueId },
      });

      // If bootstrap, create coordinator membership for creating user
      if (isBootstrap) {
        await tx.membership.create({
          data: {
            userId: req.session.userId!,
            role: 'coordinator',
            divisionId: newDivision.id,
          },
        });
      }

      return newDivision;
    });

    res.status(201).json({ division });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/divisions/:divisionId — get division details
router.get('/:divisionId', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  console.log('[division detail] divisionId:', divisionId, 'userId:', req.session.userId);

  try {
    // Check user is a member of this division
    const membership = await db.membership.findFirst({
      where: {
        userId: req.session.userId!,
        OR: [
          { divisionId },
          { team: { divisionId } },
        ],
      },
    });

    if (!membership) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const division = await db.division.findUnique({
      where: { id: divisionId },
      include: {
        league: { select: { id: true, name: true } },
        teams: {
          where: { deletedAt: null },
          select: { id: true, name: true, createdAt: true },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!division) {
      res.status(404).json({ error: 'Division not found' });
      return;
    }

    res.json({ division });
  } catch (err) {
    console.error('[division detail error]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/divisions/:divisionId/teams — create a team in the division
router.post(
  '/:divisionId/teams',
  requireAuth,
  requireCoordinator('divisionId'),
  async (req, res): Promise<void> => {
    const { divisionId } = req.params;
    const parsed = CreateTeamSchema.safeParse({ ...req.body, divisionId });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }
    const { name } = parsed.data;

    try {
      const team = await db.team.create({
        data: { name, divisionId },
      });
      res.status(201).json({ team });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/divisions/:divisionId/teams — list teams in the division
router.get('/:divisionId/teams', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;

  try {
    // Must be coordinator or any team member in this division
    const membership = await db.membership.findFirst({
      where: {
        userId: req.session.userId!,
        OR: [
          { divisionId },
          { team: { divisionId } },
        ],
      },
    });

    if (!membership) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const teams = await db.team.findMany({
      where: { divisionId, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    res.json({ teams });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
