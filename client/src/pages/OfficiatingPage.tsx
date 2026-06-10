import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { getHeats } from '../api/seeding.js';
import type { HeatData, LaneAssignmentData } from '../api/seeding.js';
import { startHeat, recordFinish, deleteFinish, markDnsDq, logDisagree } from '../api/officiating.js';
import { useHeatSocket } from '../hooks/useHeatSocket.js';

/** Format elapsed milliseconds as M:SS.ss */
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

interface DisagreeModalProps {
  finishEventId: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
}

function DisagreeModal({ finishEventId: _finishEventId, onClose, onSubmit, isPending }: DisagreeModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-4">
        <h3 className="font-semibold text-gray-900 text-lg">Log Disagreement</h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for disagreement (optional)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit(reason)}
            disabled={isPending}
            className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm"
          >
            {isPending ? 'Submitting…' : 'Submit'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OfficiatingPage() {
  const { heatId } = useParams<{ heatId: string }>();
  const { user, memberships } = useAuthContext();
  const socketState = useHeatSocket(heatId!);
  const clockDisplay = useElapsedClock(socketState.startTs);

  const [actionError, setActionError] = useState('');
  const [disagreeTarget, setDisagreeTarget] = useState<string | null>(null);
  const [showDnsDq, setShowDnsDq] = useState(false);
  const [showOtherTapes, setShowOtherTapes] = useState(false);

  // Track optimistic finish state: entryId → { eventId, sequence, clientFinishTs }
  const [myFinishes, setMyFinishes] = useState<
    Array<{ eventId: string; entryId: string; clientFinishTs: number; sequence: number }>
  >([]);
  const sequenceRef = useRef(0);

  const isOfficial = memberships.some((m) => m.role === 'official' || m.role === 'coordinator');

  // We need to find which heat this is from the race heats
  // We'll look up the heat data by heatId
  const [heatData, setHeatData] = useState<HeatData | null>(null);
  const [raceId, setRaceId] = useState<string | null>(null);

  // Fetch heat data - we need the raceId first from the URL
  // Since we only have heatId, we need to load from the socket sync or a dedicated endpoint
  // For now, track lane assignments from socket tapes or load via the seeding API
  // We'll load heat data by finding heats that contain this heatId
  // Since getHeats needs raceId, we'll use a workaround: store raceId in URL state
  // Actually, we need to get the heat from the seeding API which needs raceId.
  // Let's use a different approach: load it from the reconciliation endpoint or use params.

  // The OfficiatingPage gets heatId from URL. We need to get lane assignments.
  // We'll fetch heats for the race - but we don't have raceId in this route.
  // Solution: add a dedicated GET /api/heats/:heatId endpoint, or use state passed via navigation.
  // For now we'll use the tapes from socket + lane assignments will need to be fetched.
  // We'll fetch the heat detail from a heats endpoint we'll add, or use the seeding result.

  // Since we don't have a direct GET /api/heats/:heatId, let's use a workaround:
  // The parent page (HeatSheetPage) will pass the raceId via search params
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
      if (found) {
        setHeatData(found);
        setRaceId(found.raceId);
      }
    }
  }, [heatsQuery.data, heatId]);

  // Sync startTs from heat data
  useEffect(() => {
    if (heatData?.startTs && !socketState.startTs) {
      // startTs from HTTP is string, we have it via socketState
    }
  }, [heatData, socketState.startTs]);

  const startMutation = useMutation({
    mutationFn: () => startHeat(heatId!),
    onError: (err: ApiError) => setActionError(err.message),
  });

  const recordMutation = useMutation({
    mutationFn: (data: { entry_id: string; client_finish_ts: number; sequence: number }) =>
      recordFinish(heatId!, data),
    onError: (err: ApiError) => setActionError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => deleteFinish(heatId!, eventId),
    onSuccess: (_, eventId) => {
      setMyFinishes((prev) => prev.filter((f) => f.eventId !== eventId));
    },
    onError: (err: ApiError) => setActionError(err.message),
  });

  const disagreeMutation = useMutation({
    mutationFn: (data: { finish_event_id: string; reason?: string }) =>
      logDisagree(heatId!, data),
    onSuccess: () => setDisagreeTarget(null),
    onError: (err: ApiError) => setActionError(err.message),
  });

  const dnsDqMutation = useMutation({
    mutationFn: (data: { entry_id: string; status: 'dns' | 'dq' }) =>
      markDnsDq(heatId!, data),
    onError: (err: ApiError) => setActionError(err.message),
  });

  const handleFinish = useCallback(
    (la: LaneAssignmentData) => {
      if (!socketState.startTs) return;
      const clientFinishTs = Date.now();
      const sequence = sequenceRef.current++;

      // Optimistic update
      const tempId = `temp-${sequence}`;
      setMyFinishes((prev) => [
        ...prev,
        { eventId: tempId, entryId: la.entry.id, clientFinishTs, sequence },
      ]);

      recordMutation.mutate(
        { entry_id: la.entry.id, client_finish_ts: clientFinishTs, sequence },
        {
          onSuccess: (data) => {
            // Replace temp entry with real event id
            const realEvent = data as { event: { id: string; entryId: string; clientFinishTs: number; sequence: number } };
            setMyFinishes((prev) =>
              prev.map((f) =>
                f.eventId === tempId
                  ? { ...f, eventId: realEvent.event.id }
                  : f
              )
            );
          },
          onError: () => {
            setMyFinishes((prev) => prev.filter((f) => f.eventId !== tempId));
          },
        }
      );
    },
    [socketState.startTs, recordMutation]
  );

  const laneAssignments = heatData?.laneAssignments ?? [];
  const finishedEntryIds = new Set(myFinishes.map((f) => f.entryId));

  // My tape from socket state
  const myTape = socketState.tapes.find((t) => t.officialId === user?.id);
  const otherTapes = socketState.tapes.filter((t) => t.officialId !== user?.id);

  return (
    <Layout>
      <div className="space-y-4 max-w-2xl mx-auto">
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
              title={socketState.connected ? 'Connected' : 'Disconnected'}
            />
            <span className="font-mono text-lg font-bold text-gray-800">{clockDisplay}</span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {heatData ? `Heat ${heatData.heatNumber}` : `Heat`}
          </h1>
          {raceId && (
            <p className="text-sm text-gray-500 mt-0.5">Race ID: {raceId}</p>
          )}
        </div>

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            {actionError}
            <button onClick={() => setActionError('')} className="ml-2 text-red-500 hover:text-red-700">
              x
            </button>
          </div>
        )}

        {/* START HEAT button */}
        {!socketState.startTs && isOfficial && (
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="w-full h-16 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xl font-bold rounded-xl transition-colors"
          >
            {startMutation.isPending ? 'Starting…' : 'START HEAT'}
          </button>
        )}

        {/* Finish grid */}
        {socketState.startTs && laneAssignments.length > 0 && (
          <section>
            <h2 className="font-semibold text-gray-800 mb-2">Record Finish</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...laneAssignments]
                .sort((a, b) => a.lane - b.lane)
                .map((la) => {
                  const finished = finishedEntryIds.has(la.entry.id);
                  const finishIdx = myFinishes.findIndex((f) => f.entryId === la.entry.id);
                  const place = finishIdx >= 0 ? finishIdx + 1 : null;
                  return (
                    <button
                      key={la.id}
                      onClick={() => !finished && handleFinish(la)}
                      disabled={!isOfficial || finished}
                      className={`min-h-24 rounded-xl border-2 p-3 text-left transition-all ${
                        finished
                          ? 'bg-gray-100 border-gray-300 opacity-70 cursor-default'
                          : 'bg-white border-blue-400 hover:bg-blue-50 active:scale-95 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Lane {la.lane}</span>
                        {finished && (
                          <span className="text-green-600 font-bold text-sm">
                            #{place}
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-2xl text-gray-900">
                        {la.entry.athlete.name.split(' ')[0]}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {la.entry.athlete.name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {la.entry.lineup.team.name}
                      </div>
                    </button>
                  );
                })}
            </div>
          </section>
        )}

        {/* My Tape */}
        {myFinishes.length > 0 && (
          <section>
            <h2 className="font-semibold text-gray-800 mb-2">My Tape</h2>
            <div className="space-y-2">
              {myFinishes.map((finish, idx) => {
                const la = laneAssignments.find((l) => l.entry.id === finish.entryId);
                const timeMs = socketState.startTs
                  ? finish.clientFinishTs - socketState.startTs
                  : null;
                return (
                  <div
                    key={finish.eventId}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-500 w-5">#{idx + 1}</span>
                      <div>
                        <div className="font-medium text-gray-800 text-sm">
                          {la?.entry.athlete.name ?? finish.entryId}
                        </div>
                        {timeMs !== null && (
                          <div className="text-xs text-gray-500 font-mono">
                            {formatTimeDelta(timeMs)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDisagreeTarget(finish.eventId)}
                        className="text-xs text-orange-600 hover:text-orange-800 border border-orange-300 rounded px-2 py-1"
                      >
                        Disagree
                      </button>
                      {idx === myFinishes.length - 1 && !finish.eventId.startsWith('temp-') && (
                        <button
                          onClick={() => deleteMutation.mutate(finish.eventId)}
                          disabled={deleteMutation.isPending}
                          className="text-xs text-red-600 hover:text-red-800 border border-red-300 rounded px-2 py-1"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* DNS/DQ Panel */}
        {isOfficial && laneAssignments.length > 0 && (
          <section>
            <button
              onClick={() => setShowDnsDq((v) => !v)}
              className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-left"
            >
              <span className="font-semibold text-gray-800">DNS / DQ</span>
              <span className="text-gray-400">{showDnsDq ? '▲' : '▼'}</span>
            </button>
            {showDnsDq && (
              <div className="mt-2 space-y-2">
                {laneAssignments.map((la) => (
                  <div
                    key={la.id}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-gray-800">
                      {la.entry.athlete.name}{' '}
                      <span className="text-xs text-gray-400">(Lane {la.lane})</span>
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          dnsDqMutation.mutate({ entry_id: la.entry.id, status: 'dns' })
                        }
                        disabled={dnsDqMutation.isPending}
                        className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 rounded px-2 py-1"
                      >
                        DNS
                      </button>
                      <button
                        onClick={() =>
                          dnsDqMutation.mutate({ entry_id: la.entry.id, status: 'dq' })
                        }
                        disabled={dnsDqMutation.isPending}
                        className="text-xs bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 rounded px-2 py-1"
                      >
                        DQ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* DNS/DQ events from socket */}
        {socketState.dnsDqEvents.length > 0 && (
          <section>
            <h2 className="font-semibold text-gray-800 mb-2">Flagged Entries</h2>
            <div className="space-y-1">
              {socketState.dnsDqEvents.map((e, i) => {
                const la = laneAssignments.find((l) => l.entry.id === e.entryId);
                return (
                  <div key={i} className="text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
                    <span className="font-medium">{la?.entry.athlete.name ?? e.entryId}</span>
                    {' '}
                    <span className={`uppercase font-bold text-xs ${e.status === 'dq' ? 'text-red-600' : 'text-yellow-700'}`}>
                      {e.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Other officials' tapes */}
        {otherTapes.length > 0 && (
          <section>
            <button
              onClick={() => setShowOtherTapes((v) => !v)}
              className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 text-left"
            >
              <span className="font-semibold text-gray-800">
                Other Officials ({otherTapes.length})
              </span>
              <span className="text-gray-400">{showOtherTapes ? '▲' : '▼'}</span>
            </button>
            {showOtherTapes && (
              <div className="mt-2 space-y-3">
                {otherTapes.map((tape) => (
                  <div key={tape.id} className="bg-white border border-gray-200 rounded-xl p-3">
                    <h3 className="font-medium text-gray-800 text-sm mb-2">
                      {tape.official.name}
                    </h3>
                    {tape.finishEvents.length === 0 ? (
                      <p className="text-xs text-gray-400">No finishes recorded yet</p>
                    ) : (
                      <ol className="space-y-1">
                        {tape.finishEvents.map((ev, idx) => {
                          const la = laneAssignments.find((l) => l.entry.id === ev.entryId);
                          const timeMs = socketState.startTs
                            ? ev.clientFinishTs - socketState.startTs
                            : null;
                          return (
                            <li key={ev.id} className="text-xs text-gray-600 flex items-center gap-2">
                              <span className="text-gray-400 w-4">#{idx + 1}</span>
                              <span>{la?.entry.athlete.name ?? ev.entryId}</span>
                              {timeMs !== null && (
                                <span className="font-mono text-gray-400">
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
          </section>
        )}

        {/* My tape from socket (for agreement checking) */}
        {myTape && myTape.finishEvents.length > 0 && (
          <div className="text-xs text-gray-400 text-center">
            {myTape.finishEvents.length} finish(es) recorded on server
          </div>
        )}
      </div>

      {/* Disagree Modal */}
      {disagreeTarget && (
        <DisagreeModal
          finishEventId={disagreeTarget}
          onClose={() => setDisagreeTarget(null)}
          onSubmit={(reason) => {
            if (!disagreeTarget.startsWith('temp-')) {
              disagreeMutation.mutate({
                finish_event_id: disagreeTarget,
                reason: reason || undefined,
              });
            } else {
              setDisagreeTarget(null);
            }
          }}
          isPending={disagreeMutation.isPending}
        />
      )}
    </Layout>
  );
}
