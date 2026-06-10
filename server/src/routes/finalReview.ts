import { Router } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { AdjustResultSchema, ReconcileHeatSchema } from '../lib/validation.js';
import { reconcileTapes } from '../lib/reconciliation.js';
import type { Tape } from '../lib/reconciliation.js';

/** @private */
async function getFinalRaceDay(
  finalId: string
): Promise<{ raceDayId: string; raceId: string; divisionId: string } | null> {
  const final = await db.final.findUnique({
    where: { id: finalId },
    select: {
      raceId: true,
      race: {
        select: {
          raceDayId: true,
          raceDay: { select: { divisionId: true } },
        },
      },
    },
  });
  if (!final) return null;
  return {
    raceDayId: final.race.raceDayId,
    raceId: final.raceId,
    divisionId: final.race.raceDay.divisionId,
  };
}

/** @private */
async function isPrimaryOfficial(userId: string, finalId: string): Promise<boolean> {
  const info = await getFinalRaceDay(finalId);
  if (!info) return false;
  const rd = await db.raceDay.findUnique({
    where: { id: info.raceDayId },
    select: { primaryOfficialId: true },
  });
  return rd?.primaryOfficialId === userId;
}

/** @private */
async function isPrimaryOfficialOrCoordinator(userId: string, finalId: string): Promise<boolean> {
  const info = await getFinalRaceDay(finalId);
  if (!info) return false;

  const coordinator = await db.membership.findFirst({
    where: { userId, role: 'coordinator', divisionId: info.divisionId },
  });
  if (coordinator) return true;

  const rd = await db.raceDay.findUnique({
    where: { id: info.raceDayId },
    select: { primaryOfficialId: true },
  });
  return rd?.primaryOfficialId === userId;
}

/** @private */
async function isDivisionMember(userId: string, divisionId: string): Promise<boolean> {
  const membership = await db.membership.findFirst({
    where: {
      userId,
      OR: [{ divisionId }, { team: { divisionId } }],
    },
  });
  return !!membership;
}

export function createFinalReviewRouter(io: SocketIOServer): Router {
  const router = Router({ mergeParams: true });

  // GET /api/finals/:finalId/results
  router.get('/results', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      if (!await isDivisionMember(userId, finalInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const results = await db.result.findMany({
        where: { finalId },
        include: {
          entry: {
            include: {
              athlete: true,
              lineup: { include: { team: true } },
            },
          },
        },
        orderBy: { place: 'asc' },
      });

      res.json({ results });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/finals/:finalId/reconcile
  router.post('/reconcile', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      if (!await isPrimaryOfficialOrCoordinator(userId, finalId)) {
        res.status(403).json({ error: 'Forbidden: primary official or coordinator only' });
        return;
      }

      const parsed = ReconcileHeatSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      const final = await db.final.findUnique({
        where: { id: finalId },
        select: { startTs: true },
      });
      if (!final?.startTs) {
        res.status(409).json({ error: 'Final has not started' });
        return;
      }

      const startTs = final.startTs;

      const tapes = await db.officialTape.findMany({
        where: { finalId },
        include: { finishEvents: { orderBy: { sequence: 'asc' } } },
      });

      const reconcileTapeInput: Tape[] = tapes.map((t) => ({
        officialId: t.officialId,
        events: t.finishEvents
          .filter((e) => e.entryId !== null)
          .map((e) => ({
            entryId: e.entryId!,
            timeMsFromStart: Number(e.clientFinishTs) - startTs.getTime(),
            sequence: e.sequence,
          })),
      }));

      const dnsDqResults = await db.result.findMany({
        where: { finalId, status: { in: ['dns', 'dq'] } },
      });
      const dnsDqMap = new Map<string, 'dns' | 'dq'>(
        dnsDqResults.map((r) => [r.entryId, r.status as 'dns' | 'dq'])
      );

      const entries = reconcileTapes(reconcileTapeInput, dnsDqMap);

      if (parsed.data.save) {
        await db.$transaction(async (tx) => {
          for (const entry of entries) {
            const existing = await tx.result.findFirst({
              where: { entryId: entry.entryId, finalId },
            });
            if (existing) {
              await tx.result.update({
                where: { id: existing.id },
                data: {
                  place: entry.place,
                  timeMs: entry.timeMs,
                  status: 'ok',
                  isFinal: true,
                },
              });
            } else {
              await tx.result.create({
                data: {
                  entryId: entry.entryId,
                  finalId,
                  place: entry.place,
                  timeMs: entry.timeMs,
                  status: 'ok',
                  isFinal: true,
                },
              });
            }
          }
        });
      }

      const all_agreed = entries.every((e) => e.status === 'ok');
      res.json({ entries, all_agreed });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/finals/:finalId/results/:resultId
  router.patch('/results/:resultId', requireAuth, async (req, res): Promise<void> => {
    const { finalId, resultId } = req.params;
    const userId = req.session.userId!;
    try {
      if (!await isPrimaryOfficial(userId, finalId)) {
        res.status(403).json({ error: 'Forbidden: primary official only' });
        return;
      }

      const parsed = AdjustResultSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      const existing = await db.result.findUnique({ where: { id: resultId } });
      if (!existing || existing.finalId !== finalId) {
        res.status(404).json({ error: 'Result not found' });
        return;
      }

      const updateData: Record<string, unknown> = {};
      if (parsed.data.place !== undefined) updateData.place = parsed.data.place;
      if (parsed.data.time_ms !== undefined) updateData.timeMs = parsed.data.time_ms;
      if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

      const result = await db.result.update({
        where: { id: resultId },
        data: updateData,
      });

      io.to(`final:${finalId}`).emit('final:result_adjusted', { finalId, result });

      res.json({ result });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/finals/:finalId/finalize
  router.post('/finalize', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      if (!await isPrimaryOfficial(userId, finalId)) {
        res.status(403).json({ error: 'Forbidden: primary official only' });
        return;
      }

      io.to(`final:${finalId}`).emit('final:finalized', { finalId });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/finals/:finalId/publish
  router.post('/publish', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      if (!await isPrimaryOfficialOrCoordinator(userId, finalId)) {
        res.status(403).json({ error: 'Forbidden: primary official or coordinator only' });
        return;
      }

      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      // Load final with race info for best time updates
      const finalData = await db.final.findUnique({
        where: { id: finalId },
        select: { raceId: true, race: { select: { distanceId: true } } },
      });
      if (!finalData) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      // Load all final results
      const allResults = await db.result.findMany({
        where: { finalId },
        include: {
          entry: {
            include: {
              athlete: true,
              lineup: { select: { teamId: true } },
            },
          },
        },
      });

      await db.$transaction(async (tx) => {
        // Mark all results as isFinal = true
        for (const result of allResults) {
          await tx.result.update({
            where: { id: result.id },
            data: { isFinal: true },
          });
        }

        // Update AthleteBestTime for each OK result with time
        for (const result of allResults) {
          if (result.status !== 'ok' || !result.timeMs) continue;
          const athleteId = result.entry?.athlete?.id;
          if (!athleteId) continue;

          const existing = await tx.athleteBestTime.findUnique({
            where: { athleteId_distanceId: { athleteId, distanceId: finalData.race.distanceId } },
          });

          if (!existing || result.timeMs < existing.timeMs) {
            await tx.athleteBestTime.upsert({
              where: { athleteId_distanceId: { athleteId, distanceId: finalData.race.distanceId } },
              update: { timeMs: result.timeMs, isOfficial: true },
              create: {
                athleteId,
                distanceId: finalData.race.distanceId,
                timeMs: result.timeMs,
                isOfficial: true,
              },
            });
          }
        }
      });

      io.to(`race:${finalData.raceId}`).emit('race:finals_published', {
        raceId: finalData.raceId,
        finalId,
      });

      const updatedResults = await db.result.findMany({
        where: { finalId },
        include: {
          entry: {
            include: {
              athlete: true,
              lineup: { include: { team: true } },
            },
          },
        },
        orderBy: { place: 'asc' },
      });

      res.json({ results: updatedResults });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
