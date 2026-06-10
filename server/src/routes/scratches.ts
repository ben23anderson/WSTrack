import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { ScratchAthleteSchema } from '../lib/validation.js';

const router = Router({ mergeParams: true });

const ALLOWED_SCRATCH_STATUSES = ['setup', 'boat_prep', 'seeded'];

/** Get head coach's teamId for the division containing this race. */
async function getHeadCoachTeam(userId: string, divisionId: string): Promise<string | null> {
  const m = await db.membership.findFirst({
    where: { userId, role: 'head_coach', team: { divisionId } },
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

// GET /api/races/:raceId/scratches
router.get('/scratches', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const race = await db.race.findUnique({
      where: { id: raceId },
      select: { raceDay: { select: { divisionId: true } } },
    });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    if (!await isDivisionMember(userId, race.raceDay.divisionId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    const scratches = await db.scratch.findMany({
      where: { raceId },
      include: {
        team: { select: { id: true, name: true } },
        athlete: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ scratches });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/scratches
router.post('/scratches', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const race = await db.race.findUnique({
      where: { id: raceId },
      select: { status: true, raceDay: { select: { divisionId: true } } },
    });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    if (!ALLOWED_SCRATCH_STATUSES.includes(race.status)) {
      res.status(409).json({ error: 'Scratches are not allowed once a race is live, under review, or published' }); return;
    }

    const teamId = await getHeadCoachTeam(userId, race.raceDay.divisionId);
    if (!teamId) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    const parsed = ScratchAthleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }); return;
    }
    const { athlete_id } = parsed.data;

    // Athlete must be in this team's lineup for this race
    const lineup = await db.lineup.findUnique({
      where: { teamId_raceId: { teamId, raceId } },
      include: { entries: { select: { athleteId: true } } },
    });
    if (!lineup || !lineup.entries.some((e) => e.athleteId === athlete_id)) {
      res.status(400).json({ error: 'Athlete is not in this team\'s lineup for this race' }); return;
    }

    // Check athlete belongs to team
    const athlete = await db.athlete.findFirst({
      where: { id: athlete_id, teamId },
    });
    if (!athlete) {
      res.status(404).json({ error: 'Athlete not found on this team' }); return;
    }

    const scratch = await db.scratch.create({
      data: { raceId, teamId, athleteId: athlete_id },
      include: {
        team: { select: { id: true, name: true } },
        athlete: { select: { id: true, name: true } },
      },
    });
    res.status(201).json({ scratch });
  } catch (err) {
    // Handle unique constraint violation (already scratched)
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      res.status(409).json({ error: 'Athlete is already scratched from this race' }); return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/races/:raceId/scratches/:scratchId
router.delete('/scratches/:scratchId', requireAuth, async (req, res): Promise<void> => {
  const { raceId, scratchId } = req.params;
  const userId = req.session.userId!;
  try {
    const race = await db.race.findUnique({
      where: { id: raceId },
      select: { status: true, raceDay: { select: { divisionId: true } } },
    });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    if (!ALLOWED_SCRATCH_STATUSES.includes(race.status)) {
      res.status(409).json({ error: 'Cannot un-scratch once a race is live, under review, or published' }); return;
    }

    const teamId = await getHeadCoachTeam(userId, race.raceDay.divisionId);
    if (!teamId) {
      res.status(403).json({ error: 'Forbidden: head coach only' }); return;
    }

    const scratch = await db.scratch.findFirst({
      where: { id: scratchId, raceId, teamId },
    });
    if (!scratch) { res.status(404).json({ error: 'Scratch not found' }); return; }

    await db.scratch.delete({ where: { id: scratchId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
