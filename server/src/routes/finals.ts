import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { generateFinals } from '../lib/finalsGeneration.js';

/** @private */
async function isDivisionMember(userId: string, divisionId: string): Promise<boolean> {
  const membership = await db.membership.findFirst({
    where: {
      userId,
      OR: [{ divisionId }, { team: { divisionId } }],
    },
  });
  return !!membership;
}

/** @private */
async function isCoordinator(userId: string, divisionId: string): Promise<boolean> {
  const m = await db.membership.findFirst({
    where: { userId, role: 'coordinator', divisionId },
  });
  return !!m;
}

/** @private */
async function getRaceDivisionId(raceId: string): Promise<string | null> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDay: { select: { divisionId: true } } },
  });
  return race?.raceDay.divisionId ?? null;
}

const router = Router({ mergeParams: true });

// GET /api/races/:raceId/finals
router.get('/finals', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const divisionId = await getRaceDivisionId(raceId);
    if (!divisionId) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    if (!await isDivisionMember(userId, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const finals = await db.final.findMany({
      where: { raceId },
      include: {
        laneAssignments: {
          include: {
            entry: {
              include: {
                athlete: true,
                lineup: { include: { team: true } },
              },
            },
          },
          orderBy: { lane: 'asc' },
        },
      },
      orderBy: { type: 'asc' },
    });

    res.json({ finals });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/races/:raceId/finals/:finalId
router.get('/finals/:finalId', requireAuth, async (req, res): Promise<void> => {
  const { raceId, finalId } = req.params;
  const userId = req.session.userId!;
  try {
    const divisionId = await getRaceDivisionId(raceId);
    if (!divisionId) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    if (!await isDivisionMember(userId, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const final = await db.final.findUnique({
      where: { id: finalId },
      include: {
        laneAssignments: {
          include: {
            entry: {
              include: {
                athlete: true,
                lineup: { include: { team: true } },
              },
            },
          },
          orderBy: { lane: 'asc' },
        },
        results: {
          include: {
            entry: {
              include: {
                athlete: true,
                lineup: { include: { team: true } },
              },
            },
          },
          orderBy: { place: 'asc' },
        },
      },
    });

    if (!final || final.raceId !== raceId) {
      res.status(404).json({ error: 'Final not found' });
      return;
    }

    res.json({ final });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/generate-finals
router.post('/generate-finals', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const divisionId = await getRaceDivisionId(raceId);
    if (!divisionId) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    if (!await isCoordinator(userId, divisionId)) {
      res.status(403).json({ error: 'Forbidden: coordinator only' });
      return;
    }

    // Call generateFinals with db directly (satisfies TxClient type)
    await generateFinals(raceId, db);

    const finals = await db.final.findMany({
      where: { raceId },
      include: {
        laneAssignments: {
          include: {
            entry: {
              include: {
                athlete: true,
                lineup: { include: { team: true } },
              },
            },
          },
          orderBy: { lane: 'asc' },
        },
      },
      orderBy: { type: 'asc' },
    });

    res.json({ finals });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
