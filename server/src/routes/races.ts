import { Router } from 'express';
import { Prisma } from '@prisma/client';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { CreateRaceSchema, UpdateRaceSchema } from '../lib/validation.js';

const router = Router({ mergeParams: true });

/** Look up the divisionId for a race day. */
async function getRaceDayDivision(raceDayId: string): Promise<string | null> {
  const rd = await db.raceDay.findUnique({ where: { id: raceDayId }, select: { divisionId: true } });
  return rd?.divisionId ?? null;
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

// GET /api/race-days/:raceDayId/races
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId } = req.params;
  try {
    const divisionId = await getRaceDayDivision(raceDayId);
    if (!divisionId) {
      res.status(404).json({ error: 'Race day not found' });
      return;
    }
    if (!await isDivisionMember(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const races = await db.race.findMany({
      where: { raceDayId },
      include: {
        classification: { select: { id: true, label: true, isDoubles: true } },
        distance: { select: { id: true, label: true } },
      },
      orderBy: { orderIndex: 'asc' },
    });
    res.json({ races });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/race-days/:raceDayId/races
router.post('/', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId } = req.params;
  try {
    const divisionId = await getRaceDayDivision(raceDayId);
    if (!divisionId) {
      res.status(404).json({ error: 'Race day not found' });
      return;
    }
    if (!await isCoordinator(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const parsed = CreateRaceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    const race = await db.race.create({
      data: {
        raceDayId,
        classificationId: parsed.data.classification_id,
        distanceId: parsed.data.distance_id,
        laneCount: parsed.data.lane_count,
        orderIndex: parsed.data.order_index,
        hasFinals: parsed.data.has_finals,
        finalBEnabled: parsed.data.final_b_enabled,
        advancementRule: parsed.data.advancement_rule as Prisma.InputJsonValue | undefined,
        finalBRule: parsed.data.final_b_rule as Prisma.InputJsonValue | undefined,
      },
      include: {
        classification: { select: { id: true, label: true, isDoubles: true } },
        distance: { select: { id: true, label: true } },
      },
    });
    res.status(201).json({ race });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/race-days/:raceDayId/races/lineup-status
router.get('/lineup-status', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId } = req.params;
  const userId = req.session.userId!;
  try {
    const divisionId = await getRaceDayDivision(raceDayId);
    if (!divisionId) { res.status(404).json({ error: 'Race day not found' }); return; }
    if (!await isDivisionMember(userId, divisionId)) { res.status(403).json({ error: 'Forbidden' }); return; }

    // Get all teams this user coaches — scope to this race day's races, not division filter
    const coachMemberships = await db.membership.findMany({
      where: { userId, role: 'head_coach', teamId: { not: null } },
      select: { teamId: true },
    });

    if (coachMemberships.length === 0) {
      res.json({ statuses: [] }); return;
    }

    const coachTeamIds = coachMemberships.map((m) => m.teamId!);
    const races = await db.race.findMany({ where: { raceDayId }, select: { id: true } });
    const raceIds = races.map((r) => r.id);

    const lineups = await db.lineup.findMany({
      where: { raceId: { in: raceIds }, teamId: { in: coachTeamIds } },
      select: { raceId: true, submitted: true },
    });

    const statusMap = new Map(lineups.map((l) => [l.raceId, l.submitted]));
    const statuses = raceIds.map((raceId) => ({
      raceId,
      exists: statusMap.has(raceId),
      submitted: statusMap.get(raceId) ?? false,
    }));

    res.json({ statuses });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/race-days/:raceDayId/races/:raceId
router.get('/:raceId', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId, raceId } = req.params;
  try {
    const divisionId = await getRaceDayDivision(raceDayId);
    if (!divisionId) {
      res.status(404).json({ error: 'Race day not found' });
      return;
    }
    if (!await isDivisionMember(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const race = await db.race.findFirst({
      where: { id: raceId, raceDayId },
      include: {
        classification: { select: { id: true, label: true, isDoubles: true } },
        distance: { select: { id: true, label: true } },
      },
    });
    if (!race) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }
    res.json({ race });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/race-days/:raceDayId/races/:raceId
router.patch('/:raceId', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId, raceId } = req.params;
  try {
    const divisionId = await getRaceDayDivision(raceDayId);
    if (!divisionId) {
      res.status(404).json({ error: 'Race day not found' });
      return;
    }
    if (!await isCoordinator(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const parsed = UpdateRaceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    const existing = await db.race.findFirst({ where: { id: raceId, raceDayId } });
    if (!existing) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }
    const d = parsed.data;
    const updateData: Prisma.RaceUpdateInput = {};
    if (d.classification_id !== undefined) updateData.classification = { connect: { id: d.classification_id } };
    if (d.distance_id !== undefined) updateData.distance = { connect: { id: d.distance_id } };
    if (d.lane_count !== undefined) updateData.laneCount = d.lane_count;
    if (d.order_index !== undefined) updateData.orderIndex = d.order_index;
    if (d.has_finals !== undefined) updateData.hasFinals = d.has_finals;
    if (d.final_b_enabled !== undefined) updateData.finalBEnabled = d.final_b_enabled;
    if (d.advancement_rule !== undefined) updateData.advancementRule = d.advancement_rule as Prisma.InputJsonValue;
    if (d.final_b_rule !== undefined) updateData.finalBRule = d.final_b_rule as Prisma.InputJsonValue;
    if (d.status !== undefined) updateData.status = d.status;
    const race = await db.race.update({
      where: { id: raceId },
      data: updateData,
      include: {
        classification: { select: { id: true, label: true, isDoubles: true } },
        distance: { select: { id: true, label: true } },
      },
    });
    res.json({ race });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/race-days/:raceDayId/races/:raceId
router.delete('/:raceId', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId, raceId } = req.params;
  try {
    const divisionId = await getRaceDayDivision(raceDayId);
    if (!divisionId) { res.status(404).json({ error: 'Race day not found' }); return; }
    if (!await isCoordinator(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const existing = await db.race.findFirst({ where: { id: raceId, raceDayId } });
    if (!existing) { res.status(404).json({ error: 'Race not found' }); return; }

    await db.$transaction(async (tx) => {
      const heats = await tx.heat.findMany({ where: { raceId }, select: { id: true } });
      const heatIds = heats.map(h => h.id);
      const finals = await tx.final.findMany({ where: { raceId }, select: { id: true } });
      const finalIds = finals.map(f => f.id);

      const tapes = await tx.officialTape.findMany({
        where: heatIds.length || finalIds.length
          ? { OR: [...(heatIds.length ? [{ heatId: { in: heatIds } }] : []), ...(finalIds.length ? [{ finalId: { in: finalIds } }] : [])] }
          : { id: 'none' },
        select: { id: true },
      });
      const tapeIds = tapes.map(t => t.id);

      if (tapeIds.length) {
        const fevents = await tx.finishEvent.findMany({ where: { tapeId: { in: tapeIds } }, select: { id: true } });
        const feventIds = fevents.map(e => e.id);
        if (feventIds.length) await tx.disagreeEvent.deleteMany({ where: { finishEventId: { in: feventIds } } });
        await tx.finishEvent.deleteMany({ where: { tapeId: { in: tapeIds } } });
        await tx.officialTape.deleteMany({ where: { id: { in: tapeIds } } });
      }

      const lineups = await tx.lineup.findMany({ where: { raceId }, select: { id: true } });
      const lineupIds = lineups.map(l => l.id);
      const entries = lineupIds.length
        ? await tx.lineupEntry.findMany({ where: { lineupId: { in: lineupIds } }, select: { id: true } })
        : [];
      const entryIds = entries.map(e => e.id);

      if (heatIds.length) await tx.result.deleteMany({ where: { heatId: { in: heatIds } } });
      if (finalIds.length) await tx.result.deleteMany({ where: { finalId: { in: finalIds } } });
      if (entryIds.length) {
        await tx.result.deleteMany({ where: { entryId: { in: entryIds } } });
        await tx.laneAssignment.deleteMany({ where: { entryId: { in: entryIds } } });
      }
      if (heatIds.length) await tx.laneAssignment.deleteMany({ where: { heatId: { in: heatIds } } });
      if (finalIds.length) await tx.laneAssignment.deleteMany({ where: { finalId: { in: finalIds } } });

      await tx.boatAssignment.deleteMany({ where: { raceId } });
      if (lineupIds.length) await tx.lineupEntry.deleteMany({ where: { lineupId: { in: lineupIds } } });
      await tx.lineup.deleteMany({ where: { raceId } });
      await tx.substitution.deleteMany({ where: { raceId } });
      await tx.scratch.deleteMany({ where: { raceId } });
      await tx.boatLoan.deleteMany({ where: { raceId } });
      if (heatIds.length) await tx.heat.deleteMany({ where: { raceId } });
      if (finalIds.length) await tx.final.deleteMany({ where: { raceId } });

      await tx.race.delete({ where: { id: raceId } });
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /races/:raceId]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
