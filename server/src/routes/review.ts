import { Router } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { AdjustResultSchema, ReconcileHeatSchema } from '../lib/validation.js';
import { reconcileTapes, buildTapesForReconciliation } from '../lib/reconciliation.js';

/** @private */
async function getHeatRaceDay(
  heatId: string
): Promise<{ raceDayId: string; raceId: string; divisionId: string } | null> {
  const heat = await db.heat.findUnique({
    where: { id: heatId },
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
  if (!heat) return null;
  return {
    raceDayId: heat.race.raceDayId,
    raceId: heat.raceId,
    divisionId: heat.race.raceDay.divisionId,
  };
}

/** @private */
async function isPrimaryOfficial(userId: string, heatId: string): Promise<boolean> {
  const info = await getHeatRaceDay(heatId);
  if (!info) return false;
  const rd = await db.raceDay.findUnique({
    where: { id: info.raceDayId },
    select: { primaryOfficialId: true },
  });
  return rd?.primaryOfficialId === userId;
}

/** @private */
async function isPrimaryOfficialOrCoordinator(userId: string, heatId: string): Promise<boolean> {
  const info = await getHeatRaceDay(heatId);
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

export function createReviewRouter(io: SocketIOServer): Router {
  const router = Router({ mergeParams: true });

  // GET /api/heats/:heatId/results
  router.get('/results', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      if (!await isDivisionMember(userId, heatInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const results = await db.result.findMany({
        where: { heatId },
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

  // POST /api/heats/:heatId/reconcile
  router.post('/reconcile', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      if (!await isPrimaryOfficialOrCoordinator(userId, heatId)) {
        res.status(403).json({ error: 'Forbidden: primary official or coordinator only' });
        return;
      }

      const parsed = ReconcileHeatSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      const heat = await db.heat.findUnique({
        where: { id: heatId },
        select: { startTs: true },
      });
      if (!heat?.startTs) {
        res.status(409).json({ error: 'Heat has not started' });
        return;
      }

      const startTs = heat.startTs;

      const tapes = await db.officialTape.findMany({
        where: { heatId },
        include: { finishEvents: { orderBy: { sequence: 'asc' } } },
      });

      const reconcileTapeInput = buildTapesForReconciliation(
        tapes.map((t) => ({
          officialId: t.officialId,
          events: t.finishEvents.map((e) => ({
            entryId: e.entryId,
            timeMsFromStart: Number(e.clientFinishTs) - startTs.getTime(),
            sequence: e.sequence,
          })),
        }))
      );

      const dnsDqResults = await db.result.findMany({
        where: { heatId, status: { in: ['dns', 'dq'] } },
      });
      const dnsDqMap = new Map<string, 'dns' | 'dq'>(
        dnsDqResults.map((r) => [r.entryId, r.status as 'dns' | 'dq'])
      );

      const entries = reconcileTapes(reconcileTapeInput, dnsDqMap);

      if (parsed.data.save) {
        await db.$transaction(async (tx) => {
          for (const entry of entries) {
            const existing = await tx.result.findFirst({
              where: { entryId: entry.entryId, heatId },
            });
            if (existing) {
              await tx.result.update({
                where: { id: existing.id },
                data: {
                  place: entry.place,
                  timeMs: entry.timeMs,
                  status: 'ok',
                },
              });
            } else {
              await tx.result.create({
                data: {
                  entryId: entry.entryId,
                  heatId,
                  place: entry.place,
                  timeMs: entry.timeMs,
                  status: 'ok',
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

  // PATCH /api/heats/:heatId/results/:resultId
  router.patch('/results/:resultId', requireAuth, async (req, res): Promise<void> => {
    const { heatId, resultId } = req.params;
    const userId = req.session.userId!;
    try {
      if (!await isPrimaryOfficialOrCoordinator(userId, heatId)) {
        res.status(403).json({ error: 'Forbidden: primary official only' });
        return;
      }

      const parsed = AdjustResultSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      const existing = await db.result.findUnique({ where: { id: resultId } });
      if (!existing || existing.heatId !== heatId) {
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

      io.to(`heat:${heatId}`).emit('heat:result_adjusted', { heatId, result });

      res.json({ result });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/heats/:heatId/finalize
  router.post('/finalize', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      if (!await isPrimaryOfficialOrCoordinator(userId, heatId)) {
        res.status(403).json({ error: 'Forbidden: primary official only' });
        return;
      }

      io.to(`heat:${heatId}`).emit('heat:finalized', { heatId });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
