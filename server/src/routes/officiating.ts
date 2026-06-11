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
async function isOfficialOrCoordinator(
  userId: string,
  raceDayId: string,
  divisionId: string
): Promise<boolean> {
  // Check coordinator
  const coordinator = await db.membership.findFirst({
    where: { userId, role: 'coordinator', divisionId },
  });
  if (coordinator) return true;

  // Check official on race day
  const official = await db.raceDayOfficial.findFirst({
    where: { raceDayId, userId },
  });
  if (official) return true;

  // Check primary official
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

export function createOfficiatingRouter(io: SocketIOServer): Router {
  const router = Router({ mergeParams: true });

  // POST /api/heats/:heatId/start
  router.post('/start', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, heatInfo.raceDayId, heatInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials and coordinators only' });
        return;
      }

      const existing = await db.heat.findUnique({ where: { id: heatId }, select: { startTs: true } });
      if (existing?.startTs) {
        res.status(409).json({ error: 'Heat already started' });
        return;
      }

      const heat = await db.heat.update({
        where: { id: heatId },
        data: { startTs: new Date() },
      });

      // Update race status to 'live' if not already
      await db.race.updateMany({
        where: { id: heatInfo.raceId, status: { not: 'live' } },
        data: { status: 'live' },
      });

      io.to(`heat:${heatId}`).emit('heat:started', { heatId, startTs: heat.startTs!.getTime() });

      res.json({ heat });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/heats/:heatId/tapes
  router.get('/tapes', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      // Check division membership
      const membership = await db.membership.findFirst({
        where: {
          userId,
          OR: [{ divisionId: heatInfo.divisionId }, { team: { divisionId: heatInfo.divisionId } }],
        },
      });
      if (!membership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const tapes = await db.officialTape.findMany({
        where: { heatId },
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

  // POST /api/heats/:heatId/tapes — get or create own tape
  router.post('/tapes', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, heatInfo.raceDayId, heatInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials and coordinators only' });
        return;
      }

      const existing = await db.officialTape.findFirst({
        where: { officialId: userId, heatId },
      });
      const tape = existing ?? await db.officialTape.create({
        data: { officialId: userId, heatId },
      });

      res.json({ tape });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/heats/:heatId/finish-events
  router.post('/finish-events', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, heatInfo.raceDayId, heatInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials only' });
        return;
      }

      const parsed = RecordFinishEventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      // Validate heat has started
      const heat = await db.heat.findUnique({ where: { id: heatId }, select: { startTs: true } });
      if (!heat?.startTs) {
        res.status(409).json({ error: 'Heat has not started yet' });
        return;
      }

      // Get or create tape
      let tape = await db.officialTape.findFirst({
        where: { officialId: userId, heatId },
      });
      if (!tape) {
        tape = await db.officialTape.create({
          data: { officialId: userId, heatId },
        });
      }

      const event = await db.finishEvent.create({
        data: {
          tapeId: tape.id,
          entryId: parsed.data.entry_id ?? null,
          boatNumber: parsed.data.boat_number ?? null,
          clientFinishTs: BigInt(parsed.data.client_finish_ts),
          sequence: parsed.data.sequence,
        },
      });

      const serialized = serializeEvent(event);
      io.to(`heat:${heatId}`).emit('heat:finish_recorded', {
        heatId,
        officialId: userId,
        event: serialized,
      });

      res.status(201).json({ event: serialized });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/heats/:heatId/finish-events/:eventId
  router.delete('/finish-events/:eventId', requireAuth, async (req, res): Promise<void> => {
    const { heatId, eventId } = req.params;
    const userId = req.session.userId!;
    try {
      // Verify the event belongs to this official
      const event = await db.finishEvent.findUnique({
        where: { id: eventId },
        include: { tape: { select: { officialId: true, heatId: true } } },
      });

      if (!event || event.tape.heatId !== heatId) {
        res.status(404).json({ error: 'Finish event not found' });
        return;
      }

      if (event.tape.officialId !== userId) {
        res.status(403).json({ error: 'Forbidden: can only delete your own finish events' });
        return;
      }

      await db.finishEvent.delete({ where: { id: eventId } });

      io.to(`heat:${heatId}`).emit('heat:finish_deleted', { heatId, eventId });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/heats/:heatId/dns-dq
  router.post('/dns-dq', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, heatInfo.raceDayId, heatInfo.divisionId)) {
        res.status(403).json({ error: 'Forbidden: officials only' });
        return;
      }

      const parsed = MarkDnsDqSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
        return;
      }

      // Upsert a pending Result row
      const existing = await db.result.findFirst({
        where: { entryId: parsed.data.entry_id, heatId },
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
            heatId,
            status: parsed.data.status,
            place: null,
            timeMs: null,
          },
        });
      }

      io.to(`heat:${heatId}`).emit('heat:dns_dq', {
        heatId,
        entryId: parsed.data.entry_id,
        status: parsed.data.status,
        officialId: userId,
      });

      res.json({ result });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/heats/:heatId/disagree
  router.post('/disagree', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, heatInfo.raceDayId, heatInfo.divisionId)) {
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

      io.to(`heat:${heatId}`).emit('heat:disagree', {
        heatId,
        finishEventId: parsed.data.finish_event_id,
        officialId: userId,
      });

      res.status(201).json({ event: disagreeEvent });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/heats/:heatId/reconciliation
  router.get('/reconciliation', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      // Check division membership
      const membership = await db.membership.findFirst({
        where: {
          userId,
          OR: [{ divisionId: heatInfo.divisionId }, { team: { divisionId: heatInfo.divisionId } }],
        },
      });
      if (!membership) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const heat = await db.heat.findUnique({
        where: { id: heatId },
        select: { startTs: true },
        });
      if (!heat?.startTs) {
        res.json({ reconciled: false, reason: 'Not started' });
        return;
      }

      const startTs = heat.startTs;

      const tapes = await db.officialTape.findMany({
        where: { heatId },
        include: { finishEvents: { orderBy: { sequence: 'asc' } } },
      });

      // Convert tapes to reconciliation format
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

      // Load DNS/DQ results
      const dnsDqResults = await db.result.findMany({
        where: { heatId, status: { in: ['dns', 'dq'] } },
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

  // POST /api/heats/:heatId/manual-results
  router.post('/manual-results', requireAuth, async (req, res): Promise<void> => {
    const { heatId } = req.params;
    const userId = req.session.userId!;
    try {
      const heatInfo = await getHeatRaceDay(heatId);
      if (!heatInfo) {
        res.status(404).json({ error: 'Heat not found' });
        return;
      }

      if (!await isOfficialOrCoordinator(userId, heatInfo.raceDayId, heatInfo.divisionId)) {
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
            where: { entryId: item.entry_id, heatId },
          });
          let result;
          if (existing) {
            result = await tx.result.update({
              where: { id: existing.id },
              data: {
                place: item.place,
                timeMs: item.time_ms ?? null,
                status: item.status,
              },
            });
          } else {
            result = await tx.result.create({
              data: {
                entryId: item.entry_id,
                heatId,
                place: item.place,
                timeMs: item.time_ms ?? null,
                status: item.status,
              },
            });
          }
          results.push(result);
        }

        // Update race status to 'review' if currently 'live'
        await tx.race.updateMany({
          where: { id: heatInfo.raceId, status: 'live' },
          data: { status: 'review' },
        });

        return results;
      });

      res.json({ results: savedResults });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
