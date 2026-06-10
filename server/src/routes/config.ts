import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth, requireCoordinator } from '../middleware/requireAuth.js';
import { CreateDistanceSchema, CreateClassificationSchema } from '../lib/validation.js';

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

// GET /api/divisions/:divisionId/distances
router.get('/distances', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  try {
    if (!await isDivisionMember(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const distances = await db.distance.findMany({
      where: { divisionId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    res.json({ distances });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/divisions/:divisionId/distances
router.post(
  '/distances',
  requireAuth,
  requireCoordinator('divisionId'),
  async (req, res): Promise<void> => {
    const { divisionId } = req.params;
    const parsed = CreateDistanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    try {
      const distance = await db.distance.create({
        data: {
          divisionId,
          label: parsed.data.label,
          sortOrder: parsed.data.sort_order,
        },
      });
      res.status(201).json({ distance });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/divisions/:divisionId/distances/:distanceId
router.delete(
  '/distances/:distanceId',
  requireAuth,
  requireCoordinator('divisionId'),
  async (req, res): Promise<void> => {
    const { divisionId, distanceId } = req.params;
    try {
      const existing = await db.distance.findFirst({ where: { id: distanceId, divisionId } });
      if (!existing) {
        res.status(404).json({ error: 'Distance not found' });
        return;
      }
      await db.distance.delete({ where: { id: distanceId } });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/divisions/:divisionId/classifications
router.get('/classifications', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  try {
    if (!await isDivisionMember(req.session.userId!, divisionId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const classifications = await db.classification.findMany({
      where: { divisionId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    res.json({ classifications });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/divisions/:divisionId/classifications
router.post(
  '/classifications',
  requireAuth,
  requireCoordinator('divisionId'),
  async (req, res): Promise<void> => {
    const { divisionId } = req.params;
    const parsed = CreateClassificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    try {
      const classification = await db.classification.create({
        data: {
          divisionId,
          label: parsed.data.label,
          isDoubles: parsed.data.is_doubles,
          sortOrder: parsed.data.sort_order,
        },
      });
      res.status(201).json({ classification });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/divisions/:divisionId/classifications/:classificationId
router.delete(
  '/classifications/:classificationId',
  requireAuth,
  requireCoordinator('divisionId'),
  async (req, res): Promise<void> => {
    const { divisionId, classificationId } = req.params;
    try {
      const existing = await db.classification.findFirst({
        where: { id: classificationId, divisionId },
      });
      if (!existing) {
        res.status(404).json({ error: 'Classification not found' });
        return;
      }
      await db.classification.delete({ where: { id: classificationId } });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
