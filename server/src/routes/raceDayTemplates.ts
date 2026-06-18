import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router({ mergeParams: true });

// GET /api/divisions/:divisionId/race-day-templates
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  try {
    const templates = await db.raceDayTemplate.findMany({
      where: { divisionId },
      include: {
        races: {
          orderBy: { orderIndex: 'asc' },
          include: {
            classification: { select: { id: true, label: true } },
            distance: { select: { id: true, label: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ templates });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/divisions/:divisionId/race-day-templates
router.post('/', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  const userId = req.session.userId!;
  const { name, races } = req.body as {
    name?: string;
    races?: { name: string; classificationId?: string; distanceId?: string; laneCount?: number; hasFinals?: boolean; orderIndex?: number }[];
  };
  if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
  try {
    const coord = await db.membership.findFirst({ where: { userId, role: 'coordinator', divisionId } });
    if (!coord) { res.status(403).json({ error: 'Coordinator only' }); return; }

    const template = await db.raceDayTemplate.create({
      data: {
        divisionId,
        name: name.trim(),
        races: {
          create: (races ?? []).map((r, i) => ({
            name: r.name,
            classificationId: r.classificationId || null,
            distanceId: r.distanceId || null,
            laneCount: r.laneCount ?? 8,
            hasFinals: r.hasFinals ?? true,
            orderIndex: r.orderIndex ?? i,
          })),
        },
      },
      include: {
        races: {
          orderBy: { orderIndex: 'asc' },
          include: {
            classification: { select: { id: true, label: true } },
            distance: { select: { id: true, label: true } },
          },
        },
      },
    });
    res.status(201).json({ template });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/divisions/:divisionId/race-day-templates/:templateId
router.delete('/:templateId', requireAuth, async (req, res): Promise<void> => {
  const { divisionId, templateId } = req.params;
  const userId = req.session.userId!;
  try {
    const coord = await db.membership.findFirst({ where: { userId, role: 'coordinator', divisionId } });
    if (!coord) { res.status(403).json({ error: 'Coordinator only' }); return; }
    await db.raceDayTemplate.delete({ where: { id: templateId, divisionId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/divisions/:divisionId/race-day-templates/:templateId/races
router.post('/:templateId/races', requireAuth, async (req, res): Promise<void> => {
  const { divisionId, templateId } = req.params;
  const userId = req.session.userId!;
  try {
    const coord = await db.membership.findFirst({ where: { userId, role: 'coordinator', divisionId } });
    if (!coord) { res.status(403).json({ error: 'Coordinator only' }); return; }
    const { classification_id, distance_id, lane_count, has_finals, order_index } = req.body as {
      classification_id?: string; distance_id?: string; lane_count?: number; has_finals?: boolean; order_index?: number;
    };
    const race = await db.raceDayTemplateRace.create({
      data: {
        templateId,
        name: '',
        classificationId: classification_id || null,
        distanceId: distance_id || null,
        laneCount: lane_count ?? 8,
        hasFinals: has_finals ?? true,
        orderIndex: order_index ?? 0,
      },
      include: {
        classification: { select: { id: true, label: true } },
        distance: { select: { id: true, label: true } },
      },
    });
    res.status(201).json({ race });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/divisions/:divisionId/race-day-templates/:templateId/races/:raceId
router.delete('/:templateId/races/:raceId', requireAuth, async (req, res): Promise<void> => {
  const { divisionId, templateId, raceId } = req.params;
  const userId = req.session.userId!;
  try {
    const coord = await db.membership.findFirst({ where: { userId, role: 'coordinator', divisionId } });
    if (!coord) { res.status(403).json({ error: 'Coordinator only' }); return; }
    await db.raceDayTemplateRace.delete({ where: { id: raceId, templateId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
