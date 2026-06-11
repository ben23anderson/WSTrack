import { Router } from 'express';
import db from '../lib/db.js';
import { requireBoatInventoryAccess, requireBoatRead } from '../middleware/requireAuth.js';
import { CreateBoatSchema, UpdateBoatSchema, BulkCreateBoatsSchema } from '../lib/validation.js';

export function createBoatsRouter(): Router {
  const router = Router({ mergeParams: true });

  // GET /api/teams/:teamId/boats
  router.get('/', requireBoatRead('teamId'), async (req, res): Promise<void> => {
    const { teamId } = req.params;
    try {
      const boats = await db.boat.findMany({
        where: { teamId, deletedAt: null },
        include: { boatModel: true },
        orderBy: [{ boatModelId: 'asc' }, { number: 'asc' }],
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
          boatModelId: parsed.data.boat_model_id ?? null,
          isDouble: parsed.data.is_double,
        },
        include: { boatModel: true },
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
        include: { boatModel: true },
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
          ...(parsed.data.boat_model_id !== undefined ? { boatModelId: parsed.data.boat_model_id ?? null } : {}),
          ...(parsed.data.is_double !== undefined ? { isDouble: parsed.data.is_double } : {}),
        },
        include: { boatModel: true },
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

  // POST /api/teams/:teamId/boats/bulk
  router.post('/bulk', requireBoatInventoryAccess('teamId'), async (req, res): Promise<void> => {
    const { teamId } = req.params;
    const parsed = BulkCreateBoatsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    try {
      const created: unknown[] = [];
      for (const b of parsed.data.boats) {
        const boat = await db.boat.create({
          data: { teamId, number: b.number, boatModelId: b.boat_model_id ?? null, isDouble: b.is_double },
          include: { boatModel: true },
        });
        created.push(boat);
      }
      res.status(201).json({ boats: created, count: created.length });
    } catch (err) {
      console.error('[POST /boats/bulk]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
