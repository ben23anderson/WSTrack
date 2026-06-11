import { useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { publishRace, getRaceResults, getRaceStandings } from '../api/publish.js';
import type { HeatResultGroup, StandingEntry } from '../api/publish.js';

function formatTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === 'ok' ? 'bg-green-100 text-green-700' :
    status === 'dns' ? 'bg-gray-100 text-gray-600' :
    'bg-red-100 text-red-700';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${classes}`}>
      {status.toUpperCase()}
    </span>
  );
}

export default function RaceResultsPage() {
  const { raceId } = useParams<{ raceId: string }>();
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const isOfficial = memberships.some((m) => m.role === 'official' || m.role === 'coordinator');

  const resultsQuery = useQuery<{ heats: HeatResultGroup[] }, ApiError>({
    queryKey: ['race-results', raceId],
    queryFn: () => getRaceResults(raceId!),
    enabled: !!raceId,
    retry: false,
  });

  const standingsQuery = useQuery<{ standings: StandingEntry[] }, ApiError>({
    queryKey: ['race-standings', raceId],
    queryFn: () => getRaceStandings(raceId!),
    enabled: !!raceId,
    retry: false,
  });

  const publishMutation = useMutation({
    mutationFn: () => publishRace(raceId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['race-results', raceId] });
      void queryClient.invalidateQueries({ queryKey: ['race-standings', raceId] });
    },
  });

  const heats = resultsQuery.data?.heats ?? [];
  const hasAnyResults = heats.some((h) => h.entries.length > 0);
  // Consider race published if we have any results, or publish succeeded
  const isPublished = hasAnyResults || publishMutation.isSuccess;

  // Subscribe to race socket for live publish event
  useEffect(() => {
    if (!raceId) return;
    const socket = io({ withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('race:join', { raceId });
    });

    socket.on('race:published', () => {
      void queryClient.invalidateQueries({ queryKey: ['race-results', raceId] });
      void queryClient.invalidateQueries({ queryKey: ['race-standings', raceId] });
    });

    return () => {
      socket.emit('race:leave', { raceId });
      socket.disconnect();
    };
  }, [raceId, queryClient]);

  const standings = standingsQuery.data?.standings ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to={`/races/${raceId}`} className="text-blue-600 hover:text-blue-800 text-sm">
            ← Race
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Race Results</h1>
            <p className="text-sm text-gray-500 mt-1">Race ID: {raceId}</p>
          </div>
          {!isPublished && isOfficial && (
            <button
              onClick={() => {
                if (confirm('Publish results? This will make results visible to all division members.')) {
                  publishMutation.mutate();
                }
              }}
              disabled={publishMutation.isPending}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl px-5 py-3 text-sm min-h-11 transition-colors flex-shrink-0"
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish Results'}
            </button>
          )}
        </div>

        {publishMutation.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {(publishMutation.error as ApiError).message}
          </div>
        )}

        {!isPublished ? (
          <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
            <p className="text-lg font-medium text-gray-500">Results not yet published.</p>
            {isOfficial && (
              <p className="text-sm text-gray-400 mt-1">Use the Publish Results button above when ready.</p>
            )}
          </div>
        ) : (
          <>
            {/* Heat results */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Results by Heat</h2>
              {resultsQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : heats.length === 0 ? (
                <p className="text-sm text-gray-500">No results available.</p>
              ) : (
                heats.map((heat) => (
                  <div key={heat.heatNumber} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <h3 className="font-semibold text-gray-800">Heat {heat.heatNumber}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b">
                            <th className="px-4 py-2 w-12">Place</th>
                            <th className="px-4 py-2">Athlete</th>
                            <th className="px-4 py-2">Team</th>
                            <th className="px-4 py-2 w-16">Boat</th>
                            <th className="px-4 py-2 text-right">Time</th>
                            <th className="px-4 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {heat.entries.map((e, idx) => (
                            <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-semibold text-gray-700">{e.place ?? '—'}</td>
                              <td className="px-4 py-2.5 text-gray-800 font-medium">{e.athlete.name}</td>
                              <td className="px-4 py-2.5 text-gray-600">{e.team.name}</td>
                              <td className="px-4 py-2.5 text-gray-600 font-mono">{e.boatNumber ? `#${e.boatNumber}` : '—'}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-gray-700">{formatTime(e.timeMs)}</td>
                              <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Overall standings */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Overall Standings</h2>
              {standingsQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : standings.length === 0 ? (
                <p className="text-sm text-gray-500">No standings available.</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b bg-gray-50">
                          <th className="px-4 py-2 w-12">Place</th>
                          <th className="px-4 py-2">Athlete</th>
                          <th className="px-4 py-2">Team</th>
                          <th className="px-4 py-2 w-16">Boat</th>
                          <th className="px-4 py-2 text-right">Time</th>
                          <th className="px-4 py-2">Status</th>
                          <th className="px-4 py-2">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((s) => (
                          <tr key={s.entryId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-semibold text-gray-700">{s.place ?? '—'}</td>
                            <td className="px-4 py-2.5 text-gray-800 font-medium">{s.athleteName}</td>
                            <td className="px-4 py-2.5 text-gray-600">{s.teamName}</td>
                            <td className="px-4 py-2.5 text-gray-600 font-mono">{s.boatNumber ? `#${s.boatNumber}` : '—'}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-gray-700">{formatTime(s.timeMs)}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                s.source === 'final' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {s.source === 'final' ? 'Final' : 'Heat'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
