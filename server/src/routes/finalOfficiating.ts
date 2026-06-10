import { Router } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  RecordFinishEventSchema,
  MarkDnsDqSchema,
  LogDisagreeSchema,
  ManualResultSchema,
} from '../lib/validation.js';
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
async function isOfficialOrCoordinator(
  userId: string,
  raceDayId: string,
  divisionId: string
): Promise<boolean> {
  const coordinator = await db.membership.findFirst({
    where: { userId, role: 'coordinator', divisionId },
  });
  if (coordinator) return true;

  const official = await db.raceDayOfficial.findFirst({
    where: { raceDayId, userId },
  });
  if (official) return true;

  const raceDay = await db.raceDay.findUnique({
    where: { id: raceDayId },
    select: { primaryOfficialId: true },
  });
  if (raceDay?.primaryOfficialId === userId) return true;

  return false;
}

/** @private */
function serializeEvent(event: { clientFinishTs: bigint; [key: string]: unknown }): unknown {
  return { ...event, clientFinishTs: Number(event.clientFinishTs) };
}

/** @private */
function serializeTapes(
  tapes: Array<{
    id: string;
    officialId: string;
    heatId: string | null;
    finalId: string | null;
    createdAt: Date;
    official: { id: string; name: string };
    finishEvents: Array<{
      id: string;
      tapeId: string;
      entryId: string | null;
      boatNumber: string | null;
      clientFinishTs: bigint;
      serverReceivedTs: Date;
      sequence: number;
      createdAt: Date;
    }>;
  }>
): unknown {
  return tapes.map((t) => ({
    ...t,
    finishEvents: t.finishEvents.map((e) => ({
      ...e,
      clientFinishTs: Number(e.clientFinishTs),
    })),
  }));
}

export function createFinalOfficiatingRouter(io: SocketIOServer): Router {
  const router = Router({ mergeParams: true });

  // POST /api/finals/:finalId/start
  router.post('/start', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, finalInfo.raceDayId, finalInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials and coordinators only' });
        return;
      }

      const existing = await db.final.findUnique({ where: { id: finalId }, select: { startTs: true } });
      if (existing?.startTs) {
        res.status(409).json({ error: 'Final already started' });
        return;
      }

      const final = await db.final.update({
        where: { id: finalId },
        data: { startTs: new Date() },
      });

      io.to(`final:${finalId}`).emit('final:started', { finalId, startTs: final.startTs!.getTime() });

      res.json({ final });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/finals/:finalId/tapes
  router.get('/tapes', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      const membership = await db.membership.findFirst({
        where: {
          userId,
          OR: [{ divisionId: finalInfo.divisionId }, { team: { divisionId: finalInfo.divisionId } }],
        },
      });
      if (!membership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const tapes = await db.officialTape.findMany({
        where: { finalId },
        include: {
          finishEvents: { orderBy: { sequence: 'asc' } },
          official: { select: { id: true, name: true } },
        },
      });

      res.json({ tapes: serializeTapes(tapes) });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/finals/:finalId/tapes — get or create own tape
  router.post('/tapes', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, finalInfo.raceDayId, finalInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials and coordinators only' });
        return;
      }

      const existing = await db.officialTape.findFirst({
        where: { officialId: userId, finalId },
      });
      const tape = existing ?? await db.officialTape.create({
        data: { officialId: userId, finalId },
      });

      res.json({ tape });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/finals/:finalId/finish-events
  router.post('/finish-events', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, finalInfo.raceDayId, finalInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials only' });
        return;
      }

      const parsed = RecordFinishEventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      const final = await db.final.findUnique({ where: { id: finalId }, select: { startTs: true } });
      if (!final?.startTs) {
        res.status(409).json({ error: 'Final has not started yet' });
        return;
      }

      let tape = await db.officialTape.findFirst({
        where: { officialId: userId, finalId },
      });
      if (!tape) {
        tape = await db.officialTape.create({
          data: { officialId: userId, finalId },
        });
      }

      const event = await db.finishEvent.create({
        data: {
          tapeId: tape.id,
          entryId: parsed.data.entry_id,
          clientFinishTs: BigInt(parsed.data.client_finish_ts),
          sequence: parsed.data.sequence,
        },
      });

      const serialized = serializeEvent(event);
      io.to(`final:${finalId}`).emit('final:finish_recorded', {
        finalId,
        officialId: userId,
        event: serialized,
      });

      res.status(201).json({ event: serialized });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/finals/:finalId/finish-events/:eventId
  router.delete('/finish-events/:eventId', requireAuth, async (req, res): Promise<void> => {
    const { finalId, eventId } = req.params;
    const userId = req.session.userId!;
    try {
      const event = await db.finishEvent.findUnique({
        where: { id: eventId },
        include: { tape: { select: { officialId: true, finalId: true } } },
      });

      if (!event || event.tape.finalId !== finalId) {
        res.status(404).json({ error: 'Finish event not found' });
        return;
      }

      if (event.tape.officialId !== userId) {
        res.status(403).json({ error: 'Forbidden: can only delete your own finish events' });
        return;
      }

      await db.finishEvent.delete({ where: { id: eventId } });

      io.to(`final:${finalId}`).emit('final:finish_deleted', { finalId, eventId });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/finals/:finalId/dns-dq
  router.post('/dns-dq', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, finalInfo.raceDayId, finalInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials only' });
        return;
      }

      const parsed = MarkDnsDqSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      const existing = await db.result.findFirst({
        where: { entryId: parsed.data.entry_id, finalId },
      });

      let result;
      if (existing) {
        result = await db.result.update({
          where: { id: existing.id },
          data: { status: parsed.data.status, place: null, timeMs: null },
        });
      } else {
        result = await db.result.create({
          data: {
            entryId: parsed.data.entry_id,
            finalId,
            status: parsed.data.status,
            place: null,
            timeMs: null,
            isFinal: true,
          },
        });
      }

      io.to(`final:${finalId}`).emit('final:dns_dq', {
        finalId,
        entryId: parsed.data.entry_id,
        status: parsed.data.status,
        officialId: userId,
      });

      res.json({ result });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/finals/:finalId/disagree
  router.post('/disagree', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, finalInfo.raceDayId, finalInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials only' });
        return;
      }

      const parsed = LogDisagreeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      const disagreeEvent = await db.disagreeEvent.create({
        data: {
          finishEventId: parsed.data.finish_event_id,
          officialId: userId,
          reason: parsed.data.reason,
        },
      });

      io.to(`final:${finalId}`).emit('final:disagree', {
        finalId,
        finishEventId: parsed.data.finish_event_id,
        officialId: userId,
      });

      res.status(201).json({ event: disagreeEvent });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/finals/:finalId/reconciliation
  router.get('/reconciliation', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      const membership = await db.membership.findFirst({
        where: {
          userId,
          OR: [{ divisionId: finalInfo.divisionId }, { team: { divisionId: finalInfo.divisionId } }],
        },
      });
      if (!membership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const final = await db.final.findUnique({
        where: { id: finalId },
        select: { startTs: true },
      });
      if (!final?.startTs) {
        res.json({ reconciled: false, reason: 'Not started' });
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

      res.json({
        reconciled: true,
        entries,
        all_agreed: entries.every((e) => e.status === 'ok'),
      });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/finals/:finalId/manual-results
  router.post('/manual-results', requireAuth, async (req, res): Promise<void> => {
    const { finalId } = req.params;
    const userId = req.session.userId!;
    try {
      const finalInfo = await getFinalRaceDay(finalId);
      if (!finalInfo) {
        res.status(404).json({ error: 'Final not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, finalInfo.raceDayId, finalInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials and coordinators only' });
        return;
      }

      const parsed = ManualResultSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      const savedResults = await db.$transaction(async (tx) => {
        const results = [];
        for (const item of parsed.data.results) {
          const existing = await tx.result.findFirst({
            where: { entryId: item.entry_id, finalId },
          });
          let result;
          if (existing) {
            result = await tx.result.update({
              where: { id: existing.id },
              data: {
                place: item.place,
                timeMs: item.time_ms ?? null,
                status: item.status,
                isFinal: true,
              },
            });
          } else {
            result = await tx.result.create({
              data: {
                entryId: item.entry_id,
                finalId,
                place: item.place,
                timeMs: item.time_ms ?? null,
                status: item.status,
                isFinal: true,
              },
            });
          }
          results.push(result);
        }
        return results;
      });

      res.json({ results: savedResults });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
