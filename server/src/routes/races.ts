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
    if (!divisionId) {
      res.status(404).json({ error: 'Race day not found' });
      return;
    }
    if (!await isCoordinator(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const existing = await db.race.findFirst({ where: { id: raceId, raceDayId } });
    if (!existing) {
      res.status(404).json({ error: 'Race not found' });
      return;
    }
    if (existing.status !== 'setup') {
      res.status(409).json({ error: 'Race can only be deleted when in setup status' });
      return;
    }
    await db.race.delete({ where: { id: raceId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
