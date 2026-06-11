import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { RequestSubstitutionSchema, ReviewSubstitutionSchema } from '../lib/validation.js';

const router = Router({ mergeParams: true });

/** Get divisionId and raceDayId for a race. */
async function getRaceInfo(raceId: string): Promise<{ divisionId: string; raceDayId: string; primaryOfficialId: string | null } | null> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: {
      raceDayId: true,
      raceDay: {
        select: { divisionId: true, primaryOfficialId: true },
      },
    },
  });
  if (!race) return null;
  return {
    divisionId: race.raceDay.divisionId,
    raceDayId: race.raceDayId,
    primaryOfficialId: race.raceDay.primaryOfficialId,
  };
}

/** Check if user is a division member (coordinator, official, or team member). */
async function isDivisionMember(userId: string, divisionId: string): Promise<boolean> {
  const m = await db.membership.findFirst({
    where: {
      userId,
      OR: [{ divisionId }, { team: { divisionId } }],
    },
  });
  return m !== null;
}

/** Get head coach's teamId in the division, or null. */
async function getHeadCoachTeam(userId: string, divisionId: string): Promise<string | null> {
  const m = await db.membership.findFirst({
    where: { userId, role: 'head_coach', team: { divisionId } },
    select: { teamId: true },
  });
  return m?.teamId ?? null;
}

// GET /api/races/:raceId/substitutions
router.get('/substitutions', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const info = await getRaceInfo(raceId);
    if (!info) { res.status(404).json({ error: 'Race not found' }); return; }

    if (!await isDivisionMember(userId, info.divisionId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    const substitutions = await db.substitution.findMany({
      where: { raceId },
      include: {
        team: { select: { id: true, name: true } },
        outAthlete: { select: { id: true, name: true } },
        inAthlete: { select: { id: true, name: true } },
        proposedBoat: { select: { id: true, number: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ substitutions });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/substitutions
router.post('/substitutions', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const info = await getRaceInfo(raceId);
    if (!info) { res.status(404).json({ error: 'Race not found' }); return; }

    const teamId = await getHeadCoachTeam(userId, info.divisionId);
    if (!teamId) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    const race = await db.race.findUnique({ where: { id: raceId }, select: { status: true } });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }
    if (['live', 'review', 'published'].includes(race.status)) {
      res.status(409).json({ error: 'Cannot request substitution once a race is live' }); return;
    }

    const parsed = RequestSubstitutionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }); return;
    }
    const { out_athlete_id, in_athlete_id } = parsed.data;

    // Verify out_athlete is in this team's lineup for this race
    const lineup = await db.lineup.findUnique({
      where: { teamId_raceId: { teamId, raceId } },
      include: { entries: { select: { athleteId: true } } },
    });
    if (!lineup) {
      res.status(404).json({ error: 'No lineup found for your team in this race' }); return;
    }
    const outInLineup = lineup.entries.some((e) => e.athleteId === out_athlete_id);
    if (!outInLineup) {
      res.status(400).json({ error: 'Out-athlete is not in the lineup for this race' }); return;
    }

    // in_athlete must not be in any race today
    const allRacesOnDay = await db.race.findMany({
      where: { raceDayId: info.raceDayId },
      select: { id: true },
    });
    const raceIds = allRacesOnDay.map((r) => r.id);
    const alreadyEntered = await db.lineupEntry.findFirst({
      where: { athleteId: in_athlete_id, lineup: { raceId: { in: raceIds } } },
    });
    if (alreadyEntered) {
      res.status(409).json({ error: 'Incoming athlete is already entered in a race today' }); return;
    }

    const sub = await db.substitution.create({
      data: {
        raceId,
        teamId,
        outAthleteId: out_athlete_id,
        inAthleteId: in_athlete_id,
        status: 'pending',
        proposedBoatId: req.body.proposed_boat_id || null,
      },
      include: {
        team: { select: { id: true, name: true } },
        outAthlete: { select: { id: true, name: true } },
        inAthlete: { select: { id: true, name: true } },
        proposedBoat: { select: { id: true, number: true } },
      },
    });
    res.status(201).json({ substitution: sub });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/races/:raceId/substitutions/:substitutionId — primary official only
router.patch('/substitutions/:substitutionId', requireAuth, async (req, res): Promise<void> => {
  const { raceId, substitutionId } = req.params;
  const userId = req.session.userId!;
  try {
    const info = await getRaceInfo(raceId);
    if (!info) { res.status(404).json({ error: 'Race not found' }); return; }

    if (info.primaryOfficialId !== userId) {
      res.status(403).json({ error: 'Forbidden: primary official only' }); return;
    }

    const parsed = ReviewSubstitutionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }); return;
    }

    const existing = await db.substitution.findFirst({
      where: { id: substitutionId, raceId },
    });
    if (!existing) { res.status(404).json({ error: 'Substitution not found' }); return; }

    const substitution = await db.substitution.update({
      where: { id: substitutionId },
      data: { status: parsed.data.status },
      include: {
        team: { select: { id: true, name: true } },
        outAthlete: { select: { id: true, name: true } },
        inAthlete: { select: { id: true, name: true } },
        proposedBoat: { select: { id: true, number: true } },
      },
    });

    // If approved: swap lineup entry and handle boat assignment
    if (parsed.data.status === 'approved') {
      const lineup = await db.lineup.findUnique({
        where: { teamId_raceId: { teamId: substitution.team.id, raceId } },
      });
      if (lineup) {
        const entry = await db.lineupEntry.findFirst({
          where: { lineupId: lineup.id, athleteId: substitution.outAthlete.id },
        });
        if (entry) {
          await db.lineupEntry.update({
            where: { id: entry.id },
            data: { athleteId: substitution.inAthlete.id },
          });
          // Apply proposed boat if specified
          if (existing.proposedBoatId) {
            await db.boatAssignment.upsert({
              where: { raceId_entryId: { raceId, entryId: entry.id } },
              update: { boatId: existing.proposedBoatId },
              create: { raceId, entryId: entry.id, boatId: existing.proposedBoatId },
            });
          }
        }
      }
    }

    res.json({ substitution });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/races/:raceId/substitutions/:substitutionId/boat
router.patch('/substitutions/:substitutionId/boat', requireAuth, async (req, res): Promise<void> => {
  const { raceId, substitutionId } = req.params;
  const userId = req.session.userId!;
  const { proposed_boat_id } = req.body as { proposed_boat_id?: string };
  try {
    const info = await getRaceInfo(raceId);
    if (!info) { res.status(404).json({ error: 'Race not found' }); return; }
    const teamId = await getHeadCoachTeam(userId, info.divisionId);
    if (!teamId) { res.status(403).json({ error: 'Forbidden: head coach only' }); return; }
    const sub = await db.substitution.findFirst({
      where: { id: substitutionId, raceId, teamId, status: 'pending' },
    });
    if (!sub) { res.status(404).json({ error: 'Substitution not found or not pending' }); return; }
    const updated = await db.substitution.update({
      where: { id: substitutionId },
      data: { proposedBoatId: proposed_boat_id || null },
      include: {
        team: { select: { id: true, name: true } },
        outAthlete: { select: { id: true, name: true } },
        inAthlete: { select: { id: true, name: true } },
        proposedBoat: { select: { id: true, number: true } },
      },
    });
    res.json({ substitution: updated });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
