import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { AddLineupEntrySchema, BulkAddLineupEntriesSchema } from '../lib/validation.js';

const router = Router({ mergeParams: true });

/** Check if any race on the day is live/review/published. */
async function anyRaceOnDayIsLive(raceDayId: string): Promise<boolean> {
  const liveRace = await db.race.findFirst({
    where: { raceDayId, status: { in: ['live', 'review', 'published'] } },
  });
  return liveRace !== null;
}

/** Look up the raceDay and divisionId for a race. */
async function getRaceDivision(raceId: string): Promise<{ divisionId: string; raceDayId: string } | null> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true, raceDay: { select: { divisionId: true } } },
  });
  if (!race) return null;
  return { divisionId: race.raceDay.divisionId, raceDayId: race.raceDayId };
}

/** Check if user is a coordinator of a division. */
async function isCoordinator(userId: string, divisionId: string): Promise<boolean> {
  const m = await db.membership.findFirst({
    where: { userId, role: 'coordinator', divisionId },
  });
  return m !== null;
}

/** Check if user is a head_coach of any team in the division. */
async function getHeadCoachTeam(userId: string, divisionId: string): Promise<string | null> {
  const m = await db.membership.findFirst({
    where: {
      userId,
      role: 'head_coach',
      team: { divisionId },
    },
    select: { teamId: true },
  });
  return m?.teamId ?? null;
}

/** Check if user is a division member (directly or via team). */
async function isDivisionMember(userId: string, divisionId: string): Promise<boolean> {
  const m = await db.membership.findFirst({
    where: {
      userId,
      OR: [{ divisionId }, { team: { divisionId } }],
    },
  });
  return m !== null;
}

// GET /api/races/:raceId/lineups
router.get('/lineups', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const info = await getRaceDivision(raceId);
    if (!info) { res.status(404).json({ error: 'Race not found' }); return; }
    const { divisionId } = info;

    if (!await isDivisionMember(userId, divisionId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    // Coordinator sees all lineups; head_coach sees only their team's
    const coord = await isCoordinator(userId, divisionId);
    const coachTeamId = coord ? null : await getHeadCoachTeam(userId, divisionId);

    const [lineups, race] = await Promise.all([
      db.lineup.findMany({
        where: {
          raceId,
          ...(coachTeamId ? { teamId: coachTeamId } : {}),
        },
        include: {
          team: { select: { id: true, name: true } },
          entries: {
            include: { athlete: { select: { id: true, name: true } } },
          },
        },
      }),
      db.race.findUnique({
        where: { id: raceId },
        select: { distanceId: true, distance: { select: { id: true, label: true } } },
      }),
    ]);
    res.json({ lineups, race });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/lineups  — get or create lineup for the head coach's team
router.post('/lineups', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const info = await getRaceDivision(raceId);
    if (!info) { res.status(404).json({ error: 'Race not found' }); return; }
    const { divisionId } = info;

    const coachTeamId = await getHeadCoachTeam(userId, divisionId);
    if (!coachTeamId) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    const lineup = await db.lineup.upsert({
      where: { teamId_raceId: { teamId: coachTeamId, raceId } },
      update: {},
      create: { teamId: coachTeamId, raceId },
      include: {
        team: { select: { id: true, name: true } },
        entries: {
          include: { athlete: { select: { id: true, name: true } } },
        },
      },
    });
    res.status(200).json({ lineup });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/lineups/:teamId/submit
router.post('/lineups/:teamId/submit', requireAuth, async (req, res): Promise<void> => {
  const { raceId, teamId } = req.params;
  const userId = req.session.userId!;
  try {
    // Verify user is head coach of this team
    const membership = await db.membership.findFirst({
      where: { userId, role: 'head_coach', teamId },
    });
    if (!membership) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    // Check race status allows submission
    const race = await db.race.findFirst({ where: { id: raceId }, select: { status: true } });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }
    if (['live', 'published'].includes(race.status)) {
      res.status(409).json({ error: 'Cannot submit lineup after race has gone live' }); return;
    }

    const lineup = await db.lineup.findUnique({ where: { teamId_raceId: { teamId, raceId } } });
    if (!lineup) { res.status(404).json({ error: 'Lineup not found' }); return; }
    if (lineup.submitted) { res.status(409).json({ error: 'Lineup already submitted' }); return; }

    const updated = await db.lineup.update({
      where: { id: lineup.id },
      data: { submitted: true },
      include: {
        team: { select: { id: true, name: true } },
        entries: { include: { athlete: { select: { id: true, name: true } } } },
      },
    });
    res.json({ lineup: updated });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/lineups/:teamId/unsubmit
router.post('/lineups/:teamId/unsubmit', requireAuth, async (req, res): Promise<void> => {
  const { raceId, teamId } = req.params;
  const userId = req.session.userId!;
  try {
    const membership = await db.membership.findFirst({
      where: { userId, role: 'head_coach', teamId },
    });
    if (!membership) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    const lineup = await db.lineup.findUnique({ where: { teamId_raceId: { teamId, raceId } } });
    if (!lineup) { res.status(404).json({ error: 'Lineup not found' }); return; }

    const raceCheck = await db.race.findUnique({ where: { id: raceId }, select: { status: true } });
    if (raceCheck && ['live', 'review', 'published'].includes(raceCheck.status)) {
      res.status(409).json({ error: 'Cannot unsubmit once a race is live' }); return;
    }

    const updated = await db.lineup.update({
      where: { id: lineup.id },
      data: { submitted: false },
      include: {
        team: { select: { id: true, name: true } },
        entries: { include: { athlete: { select: { id: true, name: true } } } },
      },
    });
    res.json({ lineup: updated });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/races/:raceId/lineups/:teamId/entries
router.get('/lineups/:teamId/entries', requireAuth, async (req, res): Promise<void> => {
  const { raceId, teamId } = req.params;
  const userId = req.session.userId!;
  try {
    const info = await getRaceDivision(raceId);
    if (!info) { res.status(404).json({ error: 'Race not found' }); return; }
    const { divisionId } = info;

    // coordinator or team member
    const coord = await isCoordinator(userId, divisionId);
    if (!coord) {
      const m = await db.membership.findFirst({ where: { userId, teamId } });
      if (!m) { res.status(403).json({ error: 'Forbidden' }); return; }
    }

    const lineup = await db.lineup.findUnique({ where: { teamId_raceId: { teamId, raceId } } });
    if (!lineup) { res.json({ entries: [] }); return; }

    const entries = await db.lineupEntry.findMany({
      where: { lineupId: lineup.id },
      include: { athlete: { select: { id: true, name: true, grade: true } } },
    });
    res.json({ entries });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/lineups/:teamId/entries
router.post('/lineups/:teamId/entries', requireAuth, async (req, res): Promise<void> => {
  const { raceId, teamId } = req.params;
  const userId = req.session.userId!;
  try {
    const membership = await db.membership.findFirst({
      where: { userId, role: 'head_coach', teamId },
    });
    if (!membership) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    const parsed = AddLineupEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }); return;
    }
    const { athlete_id, pair_id } = parsed.data;

    // Verify athlete belongs to this team
    const athlete = await db.athlete.findFirst({
      where: { id: athlete_id, teamId, deletedAt: null },
    });
    if (!athlete) {
      res.status(404).json({ error: 'Athlete not found on this team' }); return;
    }

    // Get or create the lineup
    const lineup = await db.lineup.upsert({
      where: { teamId_raceId: { teamId, raceId } },
      update: {},
      create: { teamId, raceId },
    });

    if (lineup.submitted) {
      res.status(409).json({ error: 'Lineup is already submitted' }); return;
    }

    // One-race-per-athlete-per-day enforcement
    const race = await db.race.findUnique({
      where: { id: raceId },
      select: { raceDayId: true },
    });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    if (await anyRaceOnDayIsLive(race.raceDayId)) {
      res.status(409).json({ error: 'Lineups are locked once the first race of the day has started' }); return;
    }

    const allRacesOnDay = await db.race.findMany({
      where: { raceDayId: race.raceDayId },
      select: { id: true },
    });
    const raceIds = allRacesOnDay.map((r) => r.id);

    const existingEntry = await db.lineupEntry.findFirst({
      where: {
        athleteId: athlete_id,
        lineup: { raceId: { in: raceIds } },
      },
    });
    if (existingEntry) {
      res.status(409).json({ error: 'Athlete is already entered in another race today' }); return;
    }

    const entry = await db.lineupEntry.create({
      data: {
        lineupId: lineup.id,
        athleteId: athlete_id,
        pairId: pair_id ?? null,
      },
      include: { athlete: { select: { id: true, name: true, grade: true } } },
    });
    res.status(201).json({ entry });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/lineups/:teamId/entries/bulk
router.post('/lineups/:teamId/entries/bulk', requireAuth, async (req, res): Promise<void> => {
  const { raceId, teamId } = req.params;
  const userId = req.session.userId!;
  try {
    const membership = await db.membership.findFirst({
      where: { userId, role: 'head_coach', teamId },
    });
    if (!membership) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    const parsed = BulkAddLineupEntriesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }); return;
    }
    const { athlete_ids } = parsed.data;

    const validAthletes = await db.athlete.findMany({
      where: { id: { in: athlete_ids }, teamId, deletedAt: null },
      select: { id: true },
    });
    const validIds = new Set(validAthletes.map((a) => a.id));

    const lineup = await db.lineup.upsert({
      where: { teamId_raceId: { teamId, raceId } },
      update: {},
      create: { teamId, raceId },
    });
    if (lineup.submitted) {
      res.status(409).json({ error: 'Lineup is already submitted' }); return;
    }

    const race = await db.race.findUnique({ where: { id: raceId }, select: { raceDayId: true } });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    const allRacesOnDay = await db.race.findMany({
      where: { raceDayId: race.raceDayId },
      select: { id: true },
    });
    const raceIds = allRacesOnDay.map((r) => r.id);

    const existing = await db.lineupEntry.findMany({
      where: { athleteId: { in: athlete_ids }, lineup: { raceId: { in: raceIds } } },
      select: { athleteId: true },
    });
    const alreadyEntered = new Set(existing.map((e) => e.athleteId));

    const entries = [];
    const errors: { athleteId: string; message: string }[] = [];

    for (const athleteId of athlete_ids) {
      if (!validIds.has(athleteId)) {
        errors.push({ athleteId, message: 'Athlete not found on this team' });
        continue;
      }
      if (alreadyEntered.has(athleteId)) {
        errors.push({ athleteId, message: 'Athlete is already entered in another race today' });
        continue;
      }
      try {
        const entry = await db.lineupEntry.create({
          data: { lineupId: lineup.id, athleteId },
          include: { athlete: { select: { id: true, name: true, grade: true } } },
        });
        entries.push(entry);
        alreadyEntered.add(athleteId);
      } catch {
        errors.push({ athleteId, message: 'Failed to add athlete' });
      }
    }

    res.status(201).json({ entries, errors });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/races/:raceId/lineups/:teamId/entries/:entryId
router.delete('/lineups/:teamId/entries/:entryId', requireAuth, async (req, res): Promise<void> => {
  const { raceId, teamId, entryId } = req.params;
  const userId = req.session.userId!;
  try {
    const membership = await db.membership.findFirst({
      where: { userId, role: 'head_coach', teamId },
    });
    if (!membership) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    const lineup = await db.lineup.findUnique({ where: { teamId_raceId: { teamId, raceId } } });
    if (!lineup) { res.status(404).json({ error: 'Lineup not found' }); return; }

    // Get race day id for lock check
    const raceForLock = await db.race.findUnique({ where: { id: raceId }, select: { raceDayId: true } });
    if (raceForLock && await anyRaceOnDayIsLive(raceForLock.raceDayId)) {
      res.status(409).json({ error: 'Lineups are locked once the first race of the day has started' }); return;
    }

    if (lineup.submitted) {
      res.status(409).json({ error: 'Cannot modify a submitted lineup' }); return;
    }

    const entry = await db.lineupEntry.findFirst({
      where: { id: entryId, lineupId: lineup.id },
    });
    if (!entry) { res.status(404).json({ error: 'Entry not found' }); return; }

    await db.lineupEntry.delete({ where: { id: entryId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
