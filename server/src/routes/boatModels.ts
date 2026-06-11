import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router({ mergeParams: true });

// GET /api/divisions/:divisionId/boat-models
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  try {
    const models = await db.boatModel.findMany({
      where: { divisionId },
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });
    res.json({ models });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/divisions/:divisionId/boat-models
router.post('/', requireAuth, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  const userId = req.session.userId!;
  const { brand, name } = req.body as { brand?: string; name?: string };
  if (!brand?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'brand and name are required' }); return;
  }
  try {
    // any division member can add a model
    const membership = await db.membership.findFirst({
      where: { userId, OR: [{ divisionId }, { team: { divisionId } }] },
    });
    if (!membership) { res.status(403).json({ error: 'Forbidden' }); return; }

    const model = await db.boatModel.create({
      data: { divisionId, brand: brand.trim(), name: name.trim() },
    });
    res.status(201).json({ model });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/divisions/:divisionId/boat-models/:modelId
router.delete('/:modelId', requireAuth, async (req, res): Promise<void> => {
  const { divisionId, modelId } = req.params;
  const userId = req.session.userId!;
  try {
    const coord = await db.membership.findFirst({
      where: { userId, role: 'coordinator', divisionId },
    });
    if (!coord) { res.status(403).json({ error: 'Coordinator only' }); return; }
    await db.boatModel.delete({ where: { id: modelId, divisionId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
