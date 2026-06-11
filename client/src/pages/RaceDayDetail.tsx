import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { getRaceDay } from '../api/raceDays.js';
import type { RaceDayData } from '../api/raceDays.js';
import { createRace } from '../api/races.js';
import type { RaceData } from '../api/races.js';
import { listDistances, listClassifications } from '../api/divisionConfig.js';
import type { DistanceData, ClassificationData } from '../api/divisionConfig.js';
import { ApiError } from '../api/client.js';

const STATUS_COLORS: Record<string, string> = {
  setup: 'bg-gray-100 text-gray-600',
  boat_prep: 'bg-yellow-100 text-yellow-700',
  seeded: 'bg-blue-100 text-blue-700',
  live: 'bg-green-100 text-green-700',
  review: 'bg-orange-100 text-orange-700',
  published: 'bg-purple-100 text-purple-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export default function RaceDayDetail() {
  const { raceDayId } = useParams<{ raceDayId: string }>();
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();

  const [showAddRace, setShowAddRace] = useState(false);
  const [classificationId, setClassificationId] = useState('');
  const [distanceId, setDistanceId] = useState('');
  const [laneCount, setLaneCount] = useState('8');
  const [orderIndex, setOrderIndex] = useState('0');
  const [hasFinals, setHasFinals] = useState(true);
  const [advancementRuleJson, setAdvancementRuleJson] = useState('');
  const [formError, setFormError] = useState('');

  // Find the user's divisionId from memberships (coordinator or any division membership)
  const divisionId =
    memberships.find((m) => m.role === 'coordinator')?.divisionId ??
    memberships.find((m) => m.divisionId)?.divisionId ??
    memberships.find((m) => m.team?.id)?.division?.id;

  // Fetch raceDay + races using divisionId
  const raceDayQuery = useQuery<{ raceDay: RaceDayData }, ApiError>({
    queryKey: ['raceDayWithDiv', raceDayId, divisionId],
    queryFn: () => getRaceDay(divisionId!, raceDayId!),
    enabled: !!raceDayId && !!divisionId,
  });

  // Also fetch races directly (doesn't need divisionId in this form)
  const racesDirectQuery = useQuery<{ races: RaceData[] }, ApiError>({
    queryKey: ['racesDirect', raceDayId],
    queryFn: async () => {
      const res = await fetch(`/api/race-days/${raceDayId ?? ''}/races`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new ApiError(res.status, body.error ?? 'Failed to load races');
      }
      return res.json() as Promise<{ races: RaceData[] }>;
    },
    enabled: !!raceDayId,
  });

  const raceDay = raceDayQuery.data?.raceDay;
  const races = racesDirectQuery.data?.races ?? (raceDay?.races as RaceData[] | undefined) ?? [];

  const effectiveDivisionId = raceDay?.divisionId ?? divisionId;

  const isCoordinator = memberships.some(
    (m) => m.role === 'coordinator' && (!effectiveDivisionId || m.divisionId === effectiveDivisionId)
  );

  const distancesQuery = useQuery<{ distances: DistanceData[] }, ApiError>({
    queryKey: ['distances', effectiveDivisionId],
    queryFn: () => listDistances(effectiveDivisionId!),
    enabled: !!effectiveDivisionId && showAddRace,
  });

  const classificationsQuery = useQuery<{ classifications: ClassificationData[] }, ApiError>({
    queryKey: ['classifications', effectiveDivisionId],
    queryFn: () => listClassifications(effectiveDivisionId!),
    enabled: !!effectiveDivisionId && showAddRace,
  });

  const createRaceMutation = useMutation({
    mutationFn: (data: Parameters<typeof createRace>[1]) => createRace(raceDayId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['racesDirect', raceDayId] });
      void queryClient.invalidateQueries({ queryKey: ['raceDayWithDiv'] });
      setShowAddRace(false);
      setClassificationId('');
      setDistanceId('');
      setLaneCount('8');
      setOrderIndex('0');
      setHasFinals(true);
      setAdvancementRuleJson('');
      setFormError('');
    },
    onError: (err: ApiError) => setFormError(err.message),
  });

  const handleAddRace = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!classificationId || !distanceId) {
      setFormError('Classification and distance are required'); return;
    }
    let advancementRule: Record<string, unknown> | undefined;
    if (advancementRuleJson.trim()) {
      try {
        advancementRule = JSON.parse(advancementRuleJson) as Record<string, unknown>;
      } catch {
        setFormError('Advancement rule must be valid JSON'); return;
      }
    }
    createRaceMutation.mutate({
      classification_id: classificationId,
      distance_id: distanceId,
      lane_count: parseInt(laneCount, 10) || 8,
      order_index: parseInt(orderIndex, 10) || 0,
      has_finals: hasFinals,
      advancement_rule: advancementRule,
    });
  };

  const isLoading = raceDayQuery.isLoading || racesDirectQuery.isLoading;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          {effectiveDivisionId && (
            <Link
              to={`/divisions/${effectiveDivisionId}/race-days`}
              className="text-blue-600 hover:underline text-sm"
            >
              ← Race Days
            </Link>
          )}
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {raceDay?.name ?? 'Race Day'}
          </h1>
          {raceDay?.date && (
            <p className="text-sm text-gray-500">
              {new Date(raceDay.date).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </p>
          )}
          {raceDay?.primaryOfficial && (
            <p className="text-sm text-gray-500">
              Primary official: {raceDay.primaryOfficial.name}
            </p>
          )}
        </div>

        {/* Officials list */}
        {raceDay?.officials && raceDay.officials.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-2">Officials</h2>
            <ul className="space-y-1">
              {raceDay.officials.map((o) => (
                <li key={o.userId} className="text-sm text-gray-700">
                  {o.user.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Boat Prep link */}
        <section>
          <Link
            to={`/race-days/${raceDayId ?? ''}/boat-prep`}
            className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 hover:bg-yellow-100 transition-colors min-h-11"
          >
            <span className="font-medium text-yellow-800">Boat Prep</span>
            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </section>

        {/* Races */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-700">Races</h2>
            {isCoordinator && !showAddRace && (
              <button
                onClick={() => setShowAddRace(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
              >
                + Add Race
              </button>
            )}
          </div>

          {races.length === 0 ? (
            <p className="text-gray-500 text-sm">No races scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {races.map((race) => {
                const isActive = race.status === 'seeded' || race.status === 'live';
                const isSetup = race.status === 'setup';
                return (
                  <li key={race.id} className={`rounded-xl border overflow-hidden ${isActive ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className={`font-medium ${isActive ? 'text-green-900' : 'text-gray-900'}`}>
                          {race.classification?.label ?? '—'} · {race.distance?.label ?? '—'}
                        </p>
                        <p className="text-xs text-gray-500">{race.laneCount} lanes</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={race.status} />
                        {isActive ? (
                          <Link
                            to={`/races/${race.id}`}
                            className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg px-3 py-2 text-sm min-h-11 transition-colors"
                          >
                            Go to Race →
                          </Link>
                        ) : isSetup ? (
                          <Link
                            to={`/races/${race.id}`}
                            className="text-xs text-gray-500 hover:text-gray-700 underline px-2 min-h-11 flex items-center"
                          >
                            Set up
                          </Link>
                        ) : (
                          <Link
                            to={`/races/${race.id}`}
                            className="flex items-center"
                          >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {isCoordinator && showAddRace && (
            <form
              onSubmit={handleAddRace}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
            >
              <h3 className="text-sm font-semibold text-gray-700">Add Race</h3>
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Classification *</label>
                <select
                  value={classificationId}
                  onChange={(e) => setClassificationId(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                >
                  <option value="">Select…</option>
                  {(classificationsQuery.data?.classifications ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Distance *</label>
                <select
                  value={distanceId}
                  onChange={(e) => setDistanceId(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                >
                  <option value="">Select…</option>
                  {(distancesQuery.data?.distances ?? []).map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lane count</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={laneCount}
                    onChange={(e) => setLaneCount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
                  <input
                    type="number"
                    min="0"
                    value={orderIndex}
                    onChange={(e) => setOrderIndex(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={hasFinals}
                  onChange={(e) => setHasFinals(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Has finals
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Advancement rule (JSON, optional)
                </label>
                <textarea
                  value={advancementRuleJson}
                  onChange={(e) => setAdvancementRuleJson(e.target.value)}
                  placeholder='{"type":"top_n_per_heat","top_n":2}'
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createRaceMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
                >
                  {createRaceMutation.isPending ? 'Adding…' : 'Add Race'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddRace(false); setFormError(''); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </Layout>
  );
}
