import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SeedRaceSchema } from '../lib/validation.js';
import { generateHeatAssignments } from '../lib/seeding.js';
import type { SeedEntry } from '../lib/seeding.js';

const router = Router({ mergeParams: true });

/** Look up the divisionId for a race. */
async function getRaceDivision(raceId: string): Promise<{ divisionId: string; laneCount: number; distanceId: string; status: string } | null> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: {
      laneCount: true,
      distanceId: true,
      status: true,
      raceDay: { select: { divisionId: true } },
    },
  });
  if (!race) return null;
  return {
    divisionId: race.raceDay.divisionId,
    laneCount: race.laneCount,
    distanceId: race.distanceId,
    status: race.status,
  };
}

/** Check if a user is coordinator of a division. */
async function isCoordinator(userId: string, divisionId: string): Promise<boolean> {
  const m = await db.membership.findFirst({
    where: { userId, role: 'coordinator', divisionId },
  });
  return m !== null;
}

/** Check if a user is a member of a division (directly or via team). */
async function isDivisionMember(userId: string, divisionId: string): Promise<boolean> {
  const membership = await db.membership.findFirst({
    where: {
      userId,
      OR: [
        { divisionId },
        { team: { divisionId } },
      ],
    },
  });
  return membership !== null;
}

// GET /api/races/:raceId — direct race metadata (used by RaceDetail page)
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const raceInfo = await getRaceDivision(raceId);
    if (!raceInfo) { res.status(404).json({ error: 'Race not found' }); return; }
    if (!await isDivisionMember(userId, raceInfo.divisionId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const race = await db.race.findUnique({
      where: { id: raceId },
      include: {
        classification: { select: { id: true, label: true, isDoubles: true } },
        distance: { select: { id: true, label: true } },
      },
    });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }
    res.json({ race });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/seed
router.post('/seed', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const raceInfo = await getRaceDivision(raceId);
    if (!raceInfo) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    if (!await isCoordinator(userId, raceInfo.divisionId)) {
      res.status(403).json({ error: 'Forbidden: coordinator only' });
      return;
    }

    const parsed = SeedRaceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    const { strategy, balance_teams } = parsed.data;

    // Load scratches
    const scratches = await db.scratch.findMany({ where: { raceId }, select: { athleteId: true } });
    const scratchedAthleteIds = new Set(scratches.map((s) => s.athleteId));

    // Load all submitted lineups with entries
    const lineups = await db.lineup.findMany({
      where: { raceId, submitted: true },
      include: {
        entries: {
          include: {
            athlete: { select: { id: true, teamId: true } },
          },
        },
        team: { select: { id: true } },
      },
    });

    // Build seed entries — one per racing "slot"
    // For doubles: group by pairId, take one representative per pair
    // For singles: one entry per athlete
    const seedEntries: SeedEntry[] = [];

    for (const lineup of lineups) {
      // Separate singles and doubles entries
      const singlesEntries = lineup.entries.filter(
        (e) => e.pairId === null && !scratchedAthleteIds.has(e.athleteId)
      );
      const doublesEntries = lineup.entries.filter(
        (e) => e.pairId !== null && !scratchedAthleteIds.has(e.athleteId)
      );

      // Singles: each entry is its own racing slot
      for (const entry of singlesEntries) {
        // Look up best time for the race's distance
        const bestTime = await db.athleteBestTime.findUnique({
          where: {
            athleteId_distanceId: {
              athleteId: entry.athleteId,
              distanceId: raceInfo.distanceId,
            },
          },
          select: { timeMs: true },
        });
        seedEntries.push({
          entryId: entry.id,
          teamId: lineup.team.id,
          timeMs: bestTime?.timeMs ?? null,
        });
      }

      // Doubles: group by pairId, take first entry per pair (sorted by id)
      const pairMap = new Map<string, typeof doublesEntries[0][]>();
      for (const entry of doublesEntries) {
        const pid = entry.pairId!;
        if (!pairMap.has(pid)) pairMap.set(pid, []);
        pairMap.get(pid)!.push(entry);
      }

      for (const [, pairEntries] of pairMap) {
        // Sort by id for determinism, take the first as representative
        pairEntries.sort((a, b) => a.id.localeCompare(b.id));
        const representative = pairEntries[0];
        seedEntries.push({
          entryId: representative.id,
          teamId: lineup.team.id,
          timeMs: null, // doubles always unseeded
        });
      }
    }

    // Generate heat assignments
    const assignments = generateHeatAssignments(seedEntries, {
      strategy,
      balance_teams,
      lane_count: raceInfo.laneCount,
    });

    // Build a map from representative entryId → assignment
    const assignmentByEntryId = new Map(assignments.map((a) => [a.entryId, a]));

    // Also handle doubles: both entries in a pair get the same heat/lane as the representative
    // Build a map from pairId → assignment (via representative entryId)
    // Collect all entries across all lineups for doubles pair resolution
    const allEntries = lineups.flatMap((l) => l.entries);
    const pairRepresentative = new Map<string, string>(); // pairId → representative entryId
    for (const entry of allEntries) {
      if (entry.pairId !== null && assignmentByEntryId.has(entry.id)) {
        pairRepresentative.set(entry.pairId, entry.id);
      }
    }

    // Collect all entry IDs for LaneAssignment creation
    // For each entry that is part of a pair: use the pair's representative assignment
    const entryAssignments: { entryId: string; heatNumber: number; lane: number }[] = [];

    for (const lineup of lineups) {
      for (const entry of lineup.entries) {
        if (scratchedAthleteIds.has(entry.athleteId)) continue;

        if (entry.pairId === null) {
          // Singles
          const a = assignmentByEntryId.get(entry.id);
          if (a) entryAssignments.push({ entryId: entry.id, heatNumber: a.heatNumber, lane: a.lane });
        } else {
          // Doubles: use representative's assignment
          const repId = pairRepresentative.get(entry.pairId);
          if (repId) {
            const a = assignmentByEntryId.get(repId);
            if (a) entryAssignments.push({ entryId: entry.id, heatNumber: a.heatNumber, lane: a.lane });
          }
        }
      }
    }

    // Get unique heat numbers
    const heatNumbers = [...new Set(entryAssignments.map((a) => a.heatNumber))].sort((x, y) => x - y);

    // Transaction: delete old heats (cascades to lane assignments), create new ones, update race status
    const result = await db.$transaction(async (tx) => {
      // Delete old lane assignments first (no cascade configured)
      const oldHeats = await tx.heat.findMany({ where: { raceId }, select: { id: true } });
      const oldHeatIds = oldHeats.map((h) => h.id);
      if (oldHeatIds.length > 0) {
        await tx.laneAssignment.deleteMany({ where: { heatId: { in: oldHeatIds } } });
      }
      await tx.heat.deleteMany({ where: { raceId } });

      // Create heats
      const heats = await Promise.all(
        heatNumbers.map((heatNumber) =>
          tx.heat.create({
            data: { raceId, heatNumber },
          })
        )
      );

      const heatByNumber = new Map(heats.map((h) => [h.heatNumber, h]));

      // Create lane assignments
      for (const ea of entryAssignments) {
        const heat = heatByNumber.get(ea.heatNumber);
        if (heat) {
          await tx.laneAssignment.create({
            data: {
              heatId: heat.id,
              entryId: ea.entryId,
              lane: ea.lane,
            },
          });
        }
      }

      // Update race status
      await tx.race.update({
        where: { id: raceId },
        data: { status: 'seeded' },
      });

      // Return heats with lane assignments
      const fullHeats = await tx.heat.findMany({
        where: { raceId },
        include: {
          laneAssignments: {
            include: {
              entry: {
                include: {
                  athlete: { select: { id: true, name: true, grade: true } },
                  lineup: { include: { team: { select: { id: true, name: true } } } },
                  boatAssignments: {
                    where: { raceId },
                    select: { boat: { select: { number: true } } },
                    take: 1,
                  },
                },
              },
            },
            orderBy: { lane: 'asc' },
          },
        },
        orderBy: { heatNumber: 'asc' },
      });

      return fullHeats;
    });

    res.json({ heats: result });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/races/:raceId/heats
router.get('/heats', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const raceInfo = await getRaceDivision(raceId);
    if (!raceInfo) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    if (!await isDivisionMember(userId, raceInfo.divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const heats = await db.heat.findMany({
      where: { raceId },
      include: {
        laneAssignments: {
          include: {
            entry: {
              include: {
                athlete: { select: { id: true, name: true, grade: true } },
                lineup: { include: { team: { select: { id: true, name: true } } } },
                boatAssignments: {
                  where: { raceId },
                  select: { boat: { select: { number: true } } },
                  take: 1,
                },
              },
            },
          },
          orderBy: { lane: 'asc' },
        },
      },
      orderBy: { heatNumber: 'asc' },
    });

    res.json({ heats });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/races/:raceId/heats
router.delete('/heats', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const raceInfo = await getRaceDivision(raceId);
    if (!raceInfo) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }

    if (!await isCoordinator(userId, raceInfo.divisionId)) {
      res.status(403).json({ error: 'Forbidden: coordinator only' });
      return;
    }

    if (raceInfo.status !== 'seeded') {
      res.status(409).json({ error: 'Race must be in seeded status to clear heats' });
      return;
    }

    // Delete lane assignments first, then heats
    const heats = await db.heat.findMany({ where: { raceId }, select: { id: true } });
    const heatIds = heats.map((h) => h.id);
    if (heatIds.length > 0) {
      await db.laneAssignment.deleteMany({ where: { heatId: { in: heatIds } } });
    }
    await db.heat.deleteMany({ where: { raceId } });

    await db.race.update({
      where: { id: raceId },
      data: { status: 'boat_prep' },
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
