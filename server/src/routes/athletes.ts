import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import db from '../lib/db.js';
import type { StorageProvider } from '../lib/storage/StorageProvider.js';
import { requireAuth, requireRosterAccess, requireRosterRead } from '../middleware/requireAuth.js';
import {
  CreateAthleteSchema,
  UpdateAthleteSchema,
  UpsertBestTimeSchema,
} from '../lib/validation.js';
import type { Request, Response, NextFunction } from 'express';

/** Checks for any Membership with userId = session.userId AND teamId = req.params[teamIdParam]. */
function requireTeamMember(
  teamIdParam: string
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const teamId = req.params[teamIdParam];
    try {
      const membership = await db.membership.findFirst({
        where: { userId: req.session.userId, teamId },
      });
      if (!membership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      req.membership = membership;
      next();
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export function createAthletesRouter(storage: StorageProvider): Router {
  const router = Router({ mergeParams: true });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // GET /api/teams/:teamId/athletes
  router.get('/', requireRosterRead('teamId'), async (req, res): Promise<void> => {
    const { teamId } = req.params;
    try {
      const athletes = await db.athlete.findMany({
        where: { teamId, deletedAt: null },
        include: {
          bestTimes: {
            include: { distance: { select: { id: true, label: true, sortOrder: true } } },
          },
          classification: { select: { id: true, label: true } },
        },
        orderBy: { name: 'asc' },
      });
      res.json({ athletes });
    } catch (err) {
      console.error('[GET /athletes]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/teams/:teamId/athletes
  router.post('/', requireRosterAccess('teamId'), async (req, res): Promise<void> => {
    const { teamId } = req.params;
    const parsed = CreateAthleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    try {
      const athlete = await db.athlete.create({
        data: {
          teamId,
          name: parsed.data.name,
          grade: parsed.data.grade,
          ...(parsed.data.classificationId ? { classificationId: parsed.data.classificationId } : {}),
        },
        include: {
          bestTimes: {
            include: { distance: { select: { id: true, label: true, sortOrder: true } } },
          },
          classification: { select: { id: true, label: true } },
        },
      });
      res.status(201).json({ athlete });
    } catch (err) {
      console.error('[POST /athletes]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/teams/:teamId/athletes/:athleteId
  router.get('/:athleteId', requireRosterRead('teamId'), async (req, res): Promise<void> => {
    const { teamId, athleteId } = req.params;
    try {
      const athlete = await db.athlete.findFirst({
        where: { id: athleteId, teamId, deletedAt: null },
        include: {
          bestTimes: {
            include: { distance: { select: { id: true, label: true, sortOrder: true } } },
          },
          classification: { select: { id: true, label: true } },
        },
      });
      if (!athlete) {
        res.status(404).json({ error: 'Athlete not found' });
        return;
      }
      res.json({ athlete });
    } catch (err) {
      console.error('[GET /athletes/:athleteId]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/teams/:teamId/athletes/:athleteId
  router.patch('/:athleteId', requireRosterAccess('teamId'), async (req, res): Promise<void> => {
    const { teamId, athleteId } = req.params;
    const parsed = UpdateAthleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    try {
      const existing = await db.athlete.findFirst({
        where: { id: athleteId, teamId, deletedAt: null },
      });
      if (!existing) {
        res.status(404).json({ error: 'Athlete not found' });
        return;
      }
      const athlete = await db.athlete.update({
        where: { id: athleteId },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.grade !== undefined ? { grade: parsed.data.grade } : {}),
          ...(parsed.data.classificationId !== undefined ? { classificationId: parsed.data.classificationId } : {}),
        },
        include: {
          bestTimes: {
            include: { distance: { select: { id: true, label: true, sortOrder: true } } },
          },
          classification: { select: { id: true, label: true } },
        },
      });
      res.json({ athlete });
    } catch (err) {
      console.error('[PATCH /athletes/:athleteId]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/teams/:teamId/athletes/:athleteId
  router.delete('/:athleteId', requireRosterAccess('teamId'), async (req, res): Promise<void> => {
    const { teamId, athleteId } = req.params;
    try {
      const existing = await db.athlete.findFirst({
        where: { id: athleteId, teamId, deletedAt: null },
      });
      if (!existing) {
        res.status(404).json({ error: 'Athlete not found' });
        return;
      }
      await db.athlete.update({
        where: { id: athleteId },
        data: { deletedAt: new Date() },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[DELETE /athletes/:athleteId]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/teams/:teamId/athletes/:athleteId/photo
  router.post(
    '/:athleteId/photo',
    requireRosterAccess('teamId'),
    upload.single('photo'),
    async (req, res): Promise<void> => {
      const { teamId, athleteId } = req.params;
      if (!req.file) {
        res.status(400).json({ error: 'No photo file provided' });
        return;
      }
      try {
        const existing = await db.athlete.findFirst({
          where: { id: athleteId, teamId, deletedAt: null },
        });
        if (!existing) {
          res.status(404).json({ error: 'Athlete not found' });
          return;
        }

        const resized = await sharp(req.file.buffer)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        const key = `athletes/${teamId}/${athleteId}/${Date.now()}.webp`;
        const result = await storage.upload(key, resized, 'image/webp');

        const athlete = await db.athlete.update({
          where: { id: athleteId },
          data: { photoUrl: result.url },
          include: {
            bestTimes: {
              include: { distance: { select: { id: true, label: true, sortOrder: true } } },
            },
            classification: { select: { id: true, label: true } },
          },
        });
        res.json({ athlete });
      } catch (err) {
        console.error('[POST /athletes/:athleteId/photo]', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // PUT /api/teams/:teamId/athletes/:athleteId/best-times/:distanceId
  router.put(
    '/:athleteId/best-times/:distanceId',
    requireRosterAccess('teamId'),
    async (req, res): Promise<void> => {
      const { teamId, athleteId, distanceId } = req.params;
      const parsed = UpsertBestTimeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }
      try {
        const existing = await db.athlete.findFirst({
          where: { id: athleteId, teamId, deletedAt: null },
        });
        if (!existing) {
          res.status(404).json({ error: 'Athlete not found' });
          return;
        }
        const bestTime = await db.athleteBestTime.upsert({
          where: { athleteId_distanceId: { athleteId, distanceId } },
          create: {
            athleteId,
            distanceId,
            timeMs: parsed.data.time_ms,
            isOfficial: parsed.data.is_official,
          },
          update: {
            timeMs: parsed.data.time_ms,
            isOfficial: parsed.data.is_official,
            recordedAt: new Date(),
          },
          include: { distance: { select: { id: true, label: true, sortOrder: true } } },
        });
        res.json({ bestTime });
      } catch {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /api/teams/:teamId/athletes/:athleteId/best-times/:distanceId
  router.delete(
    '/:athleteId/best-times/:distanceId',
    requireRosterAccess('teamId'),
    async (req, res): Promise<void> => {
      const { teamId, athleteId, distanceId } = req.params;
      try {
        const existing = await db.athlete.findFirst({
          where: { id: athleteId, teamId, deletedAt: null },
        });
        if (!existing) {
          res.status(404).json({ error: 'Athlete not found' });
          return;
        }
        await db.athleteBestTime.deleteMany({
          where: { athleteId, distanceId },
        });
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}
