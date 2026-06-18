import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth, requireCoordinator } from '../middleware/requireAuth.js';
import { CreateRaceDaySchema } from '../lib/validation.js';

const router = Router({ mergeParams: true });

// Helper: check if user is a member of the division (directly or via team)
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

// GET /api/divisions/:divisionId/race-days
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  try {
    if (!await isDivisionMember(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const raceDays = await db.raceDay.findMany({
      where: { divisionId, deletedAt: null },
      include: {
        _count: { select: { races: true } },
        primaryOfficial: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
    });
    res.json({ raceDays });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/divisions/:divisionId/race-days
router.post(
  '/',
  requireAuth,
  requireCoordinator('divisionId'),
  async (req, res): Promise<void> => {
    const { divisionId } = req.params;
    const parsed = CreateRaceDaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    const { name, date, primary_official_id, official_ids } = parsed.data;
    try {
      const raceDay = await db.$transaction(async (tx) => {
        const rd = await tx.raceDay.create({
          data: {
            divisionId,
            name,
            date: new Date(date),
            primaryOfficialId: primary_official_id ?? null,
          },
        });
        if (official_ids.length > 0) {
          await tx.raceDayOfficial.createMany({
            data: official_ids.map((userId) => ({ raceDayId: rd.id, userId })),
            skipDuplicates: true,
          });
        }
        return rd;
      });
      const full = await db.raceDay.findUnique({
        where: { id: raceDay.id },
        include: {
          _count: { select: { races: true } },
          primaryOfficial: { select: { id: true, name: true } },
          officials: { include: { user: { select: { id: true, name: true } } } },
        },
      });
      res.status(201).json({ raceDay: full });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/divisions/:divisionId/race-days/:raceDayId
router.get('/:raceDayId', requireAuth, async (req, res): Promise<void> => {
  const { divisionId, raceDayId } = req.params;
  try {
    if (!await isDivisionMember(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const raceDay = await db.raceDay.findFirst({
      where: { id: raceDayId, divisionId, deletedAt: null },
      include: {
        primaryOfficial: { select: { id: true, name: true } },
        officials: { include: { user: { select: { id: true, name: true } } } },
        races: {
          include: {
            classification: { select: { id: true, label: true } },
            distance: { select: { id: true, label: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    if (!raceDay) {
      res.status(404).json({ error: 'Race day not found' });
      return;
    }
    res.json({ raceDay });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/divisions/:divisionId/race-days/:raceDayId
router.patch(
  '/:raceDayId',
  requireAuth,
  requireCoordinator('divisionId'),
  async (req, res): Promise<void> => {
    const { divisionId, raceDayId } = req.params;
    try {
      const existing = await db.raceDay.findFirst({
        where: { id: raceDayId, divisionId, deletedAt: null },
      });
      if (!existing) {
        res.status(404).json({ error: 'Race day not found' });
        return;
      }
      const { name, date, primary_official_id, official_ids } = req.body as {
        name?: string;
        date?: string;
        primary_official_id?: string | null;
        official_ids?: string[];
      };

      const raceDay = await db.$transaction(async (tx) => {
        const updated = await tx.raceDay.update({
          where: { id: raceDayId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(date !== undefined ? { date: new Date(date) } : {}),
            ...(primary_official_id !== undefined ? { primaryOfficialId: primary_official_id } : {}),
          },
        });
        if (official_ids !== undefined) {
          await tx.raceDayOfficial.deleteMany({ where: { raceDayId } });
          if (official_ids.length > 0) {
            await tx.raceDayOfficial.createMany({
              data: official_ids.map((userId) => ({ raceDayId, userId })),
              skipDuplicates: true,
            });
          }
        }
        return updated;
      });
      const full = await db.raceDay.findUnique({
        where: { id: raceDay.id },
        include: {
          _count: { select: { races: true } },
          primaryOfficial: { select: { id: true, name: true } },
          officials: { include: { user: { select: { id: true, name: true } } } },
        },
      });
      res.json({ raceDay: full });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/divisions/:divisionId/race-days/:raceDayId
router.delete(
  '/:raceDayId',
  requireAuth,
  requireCoordinator('divisionId'),
  async (req, res): Promise<void> => {
    const { divisionId, raceDayId } = req.params;
    try {
      const existing = await db.raceDay.findFirst({ where: { id: raceDayId, divisionId, deletedAt: null } });
      if (!existing) { res.status(404).json({ error: 'Race day not found' }); return; }
      await db.raceDay.update({ where: { id: raceDayId }, data: { deletedAt: new Date() } });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
