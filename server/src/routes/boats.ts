import { Router } from 'express';
import db from '../lib/db.js';
import { requireBoatInventoryAccess, requireBoatRead } from '../middleware/requireAuth.js';
import { CreateBoatSchema, UpdateBoatSchema } from '../lib/validation.js';

export function createBoatsRouter(): Router {
  const router = Router({ mergeParams: true });

  // GET /api/teams/:teamId/boats
  router.get('/', requireBoatRead('teamId'), async (req, res): Promise<void> => {
    const { teamId } = req.params;
    try {
      const boats = await db.boat.findMany({
        where: { teamId, deletedAt: null },
        orderBy: [{ modelRank: 'asc' }, { numberRank: 'asc' }],
      });
      res.json({ boats });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/teams/:teamId/boats
  router.post('/', requireBoatInventoryAccess('teamId'), async (req, res): Promise<void> => {
    const { teamId } = req.params;
    const parsed = CreateBoatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    try {
      const boat = await db.boat.create({
        data: {
          teamId,
          number: parsed.data.number,
          model: parsed.data.model,
          isDouble: parsed.data.is_double,
          modelRank: parsed.data.model_rank,
          numberRank: parsed.data.number_rank,
        },
      });
      res.status(201).json({ boat });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/teams/:teamId/boats/:boatId
  router.get('/:boatId', requireBoatRead('teamId'), async (req, res): Promise<void> => {
    const { teamId, boatId } = req.params;
    try {
      const boat = await db.boat.findFirst({
        where: { id: boatId, teamId, deletedAt: null },
      });
      if (!boat) {
        res.status(404).json({ error: 'Boat not found' });
        return;
      }
      res.json({ boat });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/teams/:teamId/boats/:boatId
  router.patch('/:boatId', requireBoatInventoryAccess('teamId'), async (req, res): Promise<void> => {
    const { teamId, boatId } = req.params;
    const parsed = UpdateBoatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    try {
      const existing = await db.boat.findFirst({
        where: { id: boatId, teamId, deletedAt: null },
      });
      if (!existing) {
        res.status(404).json({ error: 'Boat not found' });
        return;
      }
      const boat = await db.boat.update({
        where: { id: boatId },
        data: {
          ...(parsed.data.number !== undefined ? { number: parsed.data.number } : {}),
          ...(parsed.data.model !== undefined ? { model: parsed.data.model } : {}),
          ...(parsed.data.is_double !== undefined ? { isDouble: parsed.data.is_double } : {}),
          ...(parsed.data.model_rank !== undefined ? { modelRank: parsed.data.model_rank } : {}),
          ...(parsed.data.number_rank !== undefined ? { numberRank: parsed.data.number_rank } : {}),
        },
      });
      res.json({ boat });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/teams/:teamId/boats/:boatId
  router.delete('/:boatId', requireBoatInventoryAccess('teamId'), async (req, res): Promise<void> => {
    const { teamId, boatId } = req.params;
    try {
      const existing = await db.boat.findFirst({
        where: { id: boatId, teamId, deletedAt: null },
      });
      if (!existing) {
        res.status(404).json({ error: 'Boat not found' });
        return;
      }
      await db.boat.update({
        where: { id: boatId },
        data: { deletedAt: new Date() },
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
