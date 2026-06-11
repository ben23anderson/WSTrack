import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface FinishEventData {
  id: string;
  entryId: string | null;
  clientFinishTs: number;
  sequence: number;
}

export interface TapeData {
  id: string;
  officialId: string;
  official: { id: string; name: string };
  finishEvents: FinishEventData[];
}

export interface HeatSocketState {
  connected: boolean;
  startTs: number | null;
  endTs: number | null;
  tapes: TapeData[];
  dnsDqEvents: Array<{ entryId: string; status: string; officialId: string }>;
  disagreeEvents: Array<{ finishEventId: string; officialId: string }>;
}

export function useHeatSocket(heatId: string): HeatSocketState {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<HeatSocketState>({
    connected: false,
    startTs: null,
    endTs: null,
    tapes: [],
    dnsDqEvents: [],
    disagreeEvents: [],
  });

  useEffect(() => {
    const socket = io({ withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setState((s) => ({ ...s, connected: true }));
      socket.emit('heat:join', { heatId });
    });

    socket.on('disconnect', () => {
      setState((s) => ({ ...s, connected: false }));
    });

    socket.on('heat:sync', ({
      tapes,
      startTs,
      endTs,
    }: { heatId: string; tapes: TapeData[]; startTs: number | null; endTs: number | null }) => {
      setState((s) => ({ ...s, tapes, startTs: startTs ?? s.startTs, endTs: endTs ?? s.endTs }));
    });

    socket.on('heat:started', ({ startTs }: { heatId: string; startTs: number }) => {
      setState((s) => ({ ...s, startTs }));
    });

    socket.on('heat:ended', ({ endTs }: { heatId: string; endTs: number }) => {
      setState((s) => ({ ...s, endTs }));
    });

    socket.on(
      'heat:finish_recorded',
      ({ officialId, event }: { heatId: string; officialId: string; event: FinishEventData }) => {
        setState((s) => ({
          ...s,
          tapes: s.tapes.map((t) =>
            t.officialId === officialId
              ? {
                  ...t,
                  finishEvents: [...t.finishEvents, event].sort(
                    (a, b) => a.sequence - b.sequence
                  ),
                }
              : t
          ),
        }));
      }
    );

    socket.on('heat:finish_deleted', ({ eventId }: { heatId: string; eventId: string }) => {
      setState((s) => ({
        ...s,
        tapes: s.tapes.map((t) => ({
          ...t,
          finishEvents: t.finishEvents.filter((e) => e.id !== eventId),
        })),
      }));
    });

    socket.on(
      'heat:dns_dq',
      (data: { entryId: string; status: string; officialId: string }) => {
        setState((s) => ({ ...s, dnsDqEvents: [...s.dnsDqEvents, data] }));
      }
    );

    socket.on(
      'heat:disagree',
      (data: { finishEventId: string; officialId: string }) => {
        setState((s) => ({ ...s, disagreeEvents: [...s.disagreeEvents, data] }));
      }
    );

    return () => {
      socket.emit('heat:leave', { heatId });
      socket.disconnect();
    };
  }, [heatId]);

  return state;
}
