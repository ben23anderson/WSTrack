import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { ApiError } from '../api/client.js';
import { getHeats } from '../api/seeding.js';
import type { HeatData } from '../api/seeding.js';
import { useHeatSocket } from '../hooks/useHeatSocket.js';

function formatTimeDelta(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

function useElapsedClock(startTs: number | null): string {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTs) { setElapsed(0); return; }
    const tick = () => setElapsed(Date.now() - startTs);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startTs]);

  return startTs ? formatTimeDelta(elapsed) : '--:--:--';
}

export default function LiveViewPage() {
  const { heatId } = useParams<{ heatId: string }>();
  const socketState = useHeatSocket(heatId!);
  const clockDisplay = useElapsedClock(socketState.startTs);
  const [heatData, setHeatData] = useState<HeatData | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const raceIdFromParams = searchParams.get('raceId');

  const heatsQuery = useQuery<{ heats: HeatData[] }, ApiError>({
    queryKey: ['heats', raceIdFromParams],
    queryFn: () => getHeats(raceIdFromParams!),
    enabled: !!raceIdFromParams,
  });

  useEffect(() => {
    if (heatsQuery.data && heatId) {
      const found = heatsQuery.data.heats.find((h) => h.id === heatId);
      if (found) setHeatData(found);
    }
  }, [heatsQuery.data, heatId]);

  const laneAssignments = heatData?.laneAssignments ?? [];

  return (
    <Layout>
      <div className="space-y-4 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {raceIdFromParams && (
              <Link
                to={`/races/${raceIdFromParams}/heats`}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                ← Heat Sheet
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                socketState.connected ? 'bg-green-500' : 'bg-red-500'
              }`}
              title={socketState.connected ? 'Live' : 'Disconnected'}
            />
            <span className="text-xs text-gray-500">
              {socketState.connected ? 'Live' : 'Disconnected'}
            </span>
            <span className="font-mono text-lg font-bold text-gray-800">{clockDisplay}</span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {heatData ? `Heat ${heatData.heatNumber} — Live` : 'Live View'}
          </h1>
        </div>

        {/* DNS/DQ badges */}
        {socketState.dnsDqEvents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {socketState.dnsDqEvents.map((e, i) => {
              const la = laneAssignments.find((l) => l.entry.id === e.entryId);
              return (
                <span
                  key={i}
                  className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                    e.status === 'dq'
                      ? 'bg-red-100 text-red-700 border border-red-300'
                      : 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                  }`}
                >
                  {la?.entry.athlete.name ?? e.entryId} — {e.status}
                </span>
              );
            })}
          </div>
        )}

        {/* All tapes side by side */}
        {socketState.tapes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">
              {socketState.startTs ? 'Waiting for officials to record finishes…' : 'Heat not started yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {socketState.tapes.map((tape) => (
              <div key={tape.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">{tape.official.name}</h3>
                  <p className="text-xs text-gray-500">
                    {tape.finishEvents.length} finish(es) recorded
                  </p>
                </div>
                {tape.finishEvents.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No finishes yet</p>
                ) : (
                  <ol className="divide-y divide-gray-50">
                    {tape.finishEvents.map((ev, idx) => {
                      const la = laneAssignments.find((l) => l.entry.id === ev.entryId);
                      const timeMs = socketState.startTs
                        ? ev.clientFinishTs - socketState.startTs
                        : null;
                      const isDnsDq = socketState.dnsDqEvents.some((d) => d.entryId === ev.entryId);
                      return (
                        <li key={ev.id} className="px-4 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-gray-400 w-5">
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="text-sm font-medium text-gray-800">
                                {la?.entry.athlete.name ?? ev.entryId}
                                {isDnsDq && (
                                  <span className="ml-1 text-xs text-red-600 uppercase font-bold">
                                    {socketState.dnsDqEvents.find((d) => d.entryId === ev.entryId)?.status}
                                  </span>
                                )}
                              </div>
                              {la && (
                                <div className="text-xs text-gray-400">
                                  {la.entry.lineup.team.name}
                                </div>
                              )}
                            </div>
                          </div>
                          {timeMs !== null && (
                            <span className="font-mono text-sm text-gray-600">
                              {formatTimeDelta(timeMs)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Disagree events */}
        {socketState.disagreeEvents.length > 0 && (
          <section className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <h2 className="font-semibold text-orange-800 mb-2">
              Disagreements Flagged ({socketState.disagreeEvents.length})
            </h2>
            <ul className="space-y-1 text-sm text-orange-700">
              {socketState.disagreeEvents.map((e, i) => (
                <li key={i}>
                  Finish event {e.finishEventId.slice(0, 8)}… flagged by official
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Layout>
  );
}
