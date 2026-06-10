import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import type { RequestHandler } from 'express';
import db from './lib/db.js';

declare module 'socket.io' {
  interface SocketData {
    userId: string;
  }
}

export function createSocketServer(
  httpServer: HttpServer,
  sessionMiddleware: RequestHandler
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
      credentials: true,
    },
  });

  // Share Express session with Socket.IO
  io.use((socket, next) => {
    sessionMiddleware(
      socket.request as Parameters<RequestHandler>[0],
      {} as Parameters<RequestHandler>[1],
      next as Parameters<RequestHandler>[2]
    );
  });

  // Auth gate
  io.use((socket, next) => {
    const req = socket.request as { session?: { userId?: string } };
    const userId = req.session?.userId;
    if (!userId) return next(new Error('Unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket: Socket) => {
    // Join a heat room (validates membership)
    socket.on('heat:join', async ({ heatId }: { heatId: string }) => {
      try {
        const heat = await db.heat.findUnique({
          where: { id: heatId },
          select: { race: { select: { raceDayId: true, raceDay: { select: { divisionId: true } } } } },
        });
        if (!heat) return;
        const divisionId = heat.race.raceDay.divisionId;
        const membership = await db.membership.findFirst({
          where: {
            userId: socket.data.userId,
            OR: [{ divisionId }, { team: { divisionId } }],
          },
        });
        if (!membership) return;
        void socket.join(`heat:${heatId}`);
        // Resync: send current tape state
        const tapes = await db.officialTape.findMany({
          where: { heatId },
          include: { finishEvents: { orderBy: { sequence: 'asc' } }, official: { select: { id: true, name: true } } },
        });
        socket.emit('heat:sync', { heatId, tapes: serializeTapes(tapes) });
      } catch { /* ignore */ }
    });

    socket.on('heat:leave', ({ heatId }: { heatId: string }) => {
      void socket.leave(`heat:${heatId}`);
    });

    socket.on('disconnect', () => { /* cleanup if needed */ });
  });

  return io;
}

type TapeWithEvents = Awaited<ReturnType<typeof db.officialTape.findMany<{
  include: { finishEvents: { orderBy: { sequence: 'asc' } }; official: { select: { id: true; name: true } } };
}>>>[number];

/** Serialize tapes, converting BigInt clientFinishTs to number. @private */
function serializeTapes(tapes: TapeWithEvents[]): unknown {
  return tapes.map((t) => ({
    ...t,
    finishEvents: t.finishEvents.map((e) => ({
      ...e,
      clientFinishTs: Number(e.clientFinishTs),
    })),
  }));
}
