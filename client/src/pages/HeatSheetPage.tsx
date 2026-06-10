import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { seedRace, getHeats, deleteHeats } from '../api/seeding.js';
import type { HeatData } from '../api/seeding.js';


function formatSeedTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

interface HeatCardProps {
  heat: HeatData;
  centerLane: number;
  raceId: string;
  isOfficial: boolean;
}

function HeatCard({ heat, centerLane, raceId, isOfficial }: HeatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Heat {heat.heatNumber}</h3>
          <p className="text-xs text-gray-500">{heat.laneAssignments.length} entries</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {isOfficial && (
            <Link
              to={`/heats/${heat.id}/officiate?raceId=${raceId}`}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2 py-1 font-medium"
            >
              Officiate
            </Link>
          )}
          {isOfficial && (
            <Link
              to={`/heats/${heat.id}/review`}
              className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg px-2 py-1 font-medium border border-amber-300"
            >
              Review
            </Link>
          )}
          <Link
            to={`/heats/${heat.id}/live?raceId=${raceId}`}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-2 py-1 font-medium border border-gray-300"
          >
            Live View
          </Link>
        </div>
      </div>
      {heat.laneAssignments.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-400">No entries in this heat.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2 w-12">Lane</th>
                <th className="px-4 py-2">Athlete</th>
                <th className="px-4 py-2">Team</th>
                <th className="px-4 py-2 text-right">Seed Time</th>
              </tr>
            </thead>
            <tbody>
              {[...heat.laneAssignments]
                .sort((a, b) => a.lane - b.lane)
                .map((la) => {
                  const isCenter = la.lane === centerLane;
                  return (
                    <tr
                      key={la.id}
                      className={`border-b border-gray-50 last:border-0 ${
                        isCenter ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono font-medium text-gray-700">
                        {la.lane}
                        {isCenter && (
                          <span className="ml-1 text-xs text-blue-500">(C)</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-800 font-medium">
                        {la.entry.athlete.name}
                        {la.entry.athlete.grade && (
                          <span className="ml-1 text-xs text-gray-400">Gr.{la.entry.athlete.grade}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {la.entry.lineup.team.name}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-500">
                        {formatSeedTime(undefined)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function HeatSheetPage() {
  const { raceId } = useParams<{ raceId: string }>();
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();

  const [strategy, setStrategy] = useState<'snake' | 'random'>('snake');
  const [balanceTeams, setBalanceTeams] = useState(false);
  const [actionError, setActionError] = useState('');

  const heatsQuery = useQuery<{ heats: HeatData[] }, ApiError>({
    queryKey: ['heats', raceId],
    queryFn: () => getHeats(raceId!),
    enabled: !!raceId,
  });

  const seedMutation = useMutation({
    mutationFn: () => seedRace(raceId!, { strategy, balance_teams: balanceTeams }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['heats', raceId] });
      setActionError('');
    },
    onError: (err: ApiError) => setActionError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteHeats(raceId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['heats', raceId] });
      setActionError('');
    },
    onError: (err: ApiError) => setActionError(err.message),
  });

  const isCoordinator = memberships.some((m) => m.role === 'coordinator');
  const isOfficial = memberships.some((m) => m.role === 'official' || m.role === 'coordinator');
  const heats = heatsQuery.data?.heats ?? [];
  const hasHeats = heats.length > 0;

  // Compute center lane: for a given heat, use the first lane assignment's lane
  // as a proxy (center is determined by laneCount, not easily known here).
  // We pick the lane that appears in most heats as the center by finding the
  // most common minimum-distance-from-center lane. Actually, simpler:
  // find the lane assigned to the first position (most seeded) — that's the center.
  // The server assigns center-out so the first entry per heat gets the center lane.
  // We'll just use the lane that appears earliest in lane order among all heats.
  // For display purposes, mark the center lane per-heat as the one that appears
  // most frequently (it's the same across heats for snake seeding).
  const centerLaneGuess = (() => {
    if (heats.length === 0) return 4; // default
    // The center lane is the one given to the first (fastest) entry per heat.
    // In seed order, the first entry in each heat is the fastest — their lane is "center".
    // Find the most common "first entry lane" across all heats.
    const laneFreq = new Map<number, number>();
    for (const heat of heats) {
      if (heat.laneAssignments.length > 0) {
        // The center lane entry doesn't have explicit ordering by seed here,
        // but we can infer: the center lane is the most-assigned lane overall.
        // Actually: in center-out, the center lane is just laneCount/2 rounded.
        // We don't have laneCount here, so use the median lane as a proxy.
        const lanes = heat.laneAssignments.map((la) => la.lane).sort((a, b) => a - b);
        const mid = lanes[Math.floor(lanes.length / 2)];
        laneFreq.set(mid, (laneFreq.get(mid) ?? 0) + 1);
      }
    }
    if (laneFreq.size === 0) return 4;
    let best = 4;
    let bestCount = 0;
    for (const [lane, count] of laneFreq) {
      if (count > bestCount) { best = lane; bestCount = count; }
    }
    return best;
  })();

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            to={`/races/${raceId}`}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            ← Race
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Heat Sheet</h1>
          <p className="text-sm text-gray-500 mt-1">Race ID: {raceId}</p>
        </div>

        {/* Coordinator controls */}
        {isCoordinator && (
          <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <h2 className="font-semibold text-gray-800">Generate Heats</h2>

            {actionError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                {actionError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Strategy
                </label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as 'snake' | 'random')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                >
                  <option value="snake">Snake (recommended)</option>
                  <option value="random">Random</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer min-h-11">
                  <input
                    type="checkbox"
                    checked={balanceTeams}
                    onChange={(e) => setBalanceTeams(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Balance Teams</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
              >
                {seedMutation.isPending
                  ? 'Generating…'
                  : hasHeats
                  ? 'Regenerate Heats'
                  : 'Generate Heats'}
              </button>

              {hasHeats && (
                <button
                  onClick={() => {
                    if (confirm('Clear all heats? This cannot be undone.')) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
                >
                  {deleteMutation.isPending ? 'Clearing…' : 'Clear Heats'}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Loading state */}
        {heatsQuery.isLoading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error state */}
        {heatsQuery.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {heatsQuery.error.message}
          </div>
        )}

        {/* Empty state */}
        {!heatsQuery.isLoading && !heatsQuery.isError && !hasHeats && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No heats generated yet.</p>
            {isCoordinator && (
              <p className="text-sm mt-1">Use the controls above to generate heats.</p>
            )}
          </div>
        )}

        {/* Heat cards */}
        {hasHeats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {heats.map((heat) => (
              <HeatCard
                key={heat.id}
                heat={heat}
                centerLane={centerLaneGuess}
                raceId={raceId!}
                isOfficial={isOfficial}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
