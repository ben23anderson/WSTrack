import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { getRaceDay } from '../api/raceDays.js';
import type { RaceDayData } from '../api/raceDays.js';
import { createRace, deleteRace, updateRace } from '../api/races.js';
import type { RaceData } from '../api/races.js';
import { listDistances, listClassifications } from '../api/divisionConfig.js';
import type { DistanceData, ClassificationData } from '../api/divisionConfig.js';
import { listTemplates } from '../api/raceDayTemplates.js';
import type { RaceDayTemplateData } from '../api/raceDayTemplates.js';
import { ApiError } from '../api/client.js';
import { getLineupStatus } from '../api/lineups.js';
import type { LineupStatus } from '../api/lineups.js';

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

type AdvancementRuleType = 'none' | 'top_n_per_heat_plus_fastest' | 'top_overall';

interface AdvancementRuleFormProps {
  ruleType: AdvancementRuleType;
  topNPerHeat: string;
  additionalFastest: string;
  topOverallCount: string;
  onRuleTypeChange: (t: AdvancementRuleType) => void;
  onTopNPerHeatChange: (v: string) => void;
  onAdditionalFastestChange: (v: string) => void;
  onTopOverallCountChange: (v: string) => void;
}

function AdvancementRuleForm({
  ruleType,
  topNPerHeat,
  additionalFastest,
  topOverallCount,
  onRuleTypeChange,
  onTopNPerHeatChange,
  onAdditionalFastestChange,
  onTopOverallCountChange,
}: AdvancementRuleFormProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Advancement Rule</label>
      <select
        value={ruleType}
        onChange={(e) => onRuleTypeChange(e.target.value as AdvancementRuleType)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
      >
        <option value="none">None (no finals)</option>
        <option value="top_n_per_heat_plus_fastest">Top N per heat + fastest</option>
        <option value="top_overall">Top overall</option>
      </select>

      {ruleType === 'top_n_per_heat_plus_fastest' && (
        <div className="grid grid-cols-2 gap-3 pl-3 border-l-2 border-blue-200">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Top N per heat</label>
            <input
              type="number"
              min="1"
              value={topNPerHeat}
              onChange={(e) => onTopNPerHeatChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-10"
              placeholder="e.g. 2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Additional fastest</label>
            <input
              type="number"
              min="0"
              value={additionalFastest}
              onChange={(e) => onAdditionalFastestChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-10"
              placeholder="e.g. 2"
            />
          </div>
        </div>
      )}

      {ruleType === 'top_overall' && (
        <div className="pl-3 border-l-2 border-blue-200">
          <label className="block text-xs font-medium text-gray-600 mb-1">Advance top N total</label>
          <input
            type="number"
            min="1"
            value={topOverallCount}
            onChange={(e) => onTopOverallCountChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-10"
            placeholder="e.g. 8"
          />
        </div>
      )}
    </div>
  );
}

function buildAdvancementRule(
  ruleType: AdvancementRuleType,
  topNPerHeat: string,
  additionalFastest: string,
  topOverallCount: string
): Record<string, unknown> | undefined {
  if (ruleType === 'none') return undefined;
  if (ruleType === 'top_n_per_heat_plus_fastest') {
    return {
      type: 'top_n_per_heat_plus_fastest',
      top_n_per_heat: parseInt(topNPerHeat, 10) || 2,
      additional_fastest: parseInt(additionalFastest, 10) || 0,
    };
  }
  if (ruleType === 'top_overall') {
    return {
      type: 'top_overall',
      count: parseInt(topOverallCount, 10) || 8,
    };
  }
  return undefined;
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
  const [ruleType, setRuleType] = useState<AdvancementRuleType>('none');
  const [topNPerHeat, setTopNPerHeat] = useState('2');
  const [additionalFastest, setAdditionalFastest] = useState('0');
  const [topOverallCount, setTopOverallCount] = useState('8');
  const [formError, setFormError] = useState('');

  // Template application state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateApplyError, setTemplateApplyError] = useState('');
  const [templateApplying, setTemplateApplying] = useState(false);

  const divisionId =
    memberships.find((m) => m.role === 'coordinator')?.divisionId ??
    memberships.find((m) => m.divisionId)?.divisionId ??
    memberships.find((m) => m.team?.id)?.division?.id;

  const raceDayQuery = useQuery<{ raceDay: RaceDayData }, ApiError>({
    queryKey: ['raceDayWithDiv', raceDayId, divisionId],
    queryFn: () => getRaceDay(divisionId!, raceDayId!),
    enabled: !!raceDayId && !!divisionId,
  });

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
  const isHeadCoach = memberships.some((m) => m.role === 'head_coach');

  const lineupStatusQuery = useQuery<{ statuses: LineupStatus[] }, ApiError>({
    queryKey: ['lineupStatus', raceDayId],
    queryFn: () => getLineupStatus(raceDayId!),
    enabled: !!raceDayId && isHeadCoach,
  });
  const lineupStatusMap = new Map(
    (lineupStatusQuery.data?.statuses ?? []).map((s) => [s.raceId, s])
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

  const templatesQuery = useQuery<{ templates: RaceDayTemplateData[] }, ApiError>({
    queryKey: ['templates', effectiveDivisionId],
    queryFn: () => listTemplates(effectiveDivisionId!),
    enabled: !!effectiveDivisionId && isCoordinator,
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
      setRuleType('none');
      setTopNPerHeat('2');
      setAdditionalFastest('0');
      setTopOverallCount('8');
      setFormError('');
    },
    onError: (err: ApiError) => setFormError(err.message),
  });

  const deleteRaceMutation = useMutation({
    mutationFn: (raceId: string) => deleteRace(raceDayId!, raceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['racesDirect', raceDayId] });
      void queryClient.invalidateQueries({ queryKey: ['raceDayWithDiv'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ raceId, swapId, raceOrder, swapOrder }: { raceId: string; swapId: string; raceOrder: number; swapOrder: number }) => {
      await Promise.all([
        updateRace(raceDayId!, raceId, { order_index: swapOrder }),
        updateRace(raceDayId!, swapId, { order_index: raceOrder }),
      ]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['racesDirect', raceDayId] });
    },
  });

  const handleAddRace = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!distanceId) {
      setFormError('Distance is required'); return;
    }
    const advancementRule = buildAdvancementRule(ruleType, topNPerHeat, additionalFastest, topOverallCount);
    createRaceMutation.mutate({
      classification_id: classificationId || undefined,
      distance_id: distanceId,
      lane_count: parseInt(laneCount, 10) || 8,
      order_index: parseInt(orderIndex, 10) || 0,
      has_finals: hasFinals,
      advancement_rule: advancementRule,
    });
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) return;
    const template = templatesQuery.data?.templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    setTemplateApplying(true);
    setTemplateApplyError('');
    try {
      for (const tr of template.races) {
        if (!tr.distance?.id) continue;
        await createRace(raceDayId!, {
          classification_id: tr.classification?.id || undefined,
          distance_id: tr.distance.id,
          lane_count: tr.laneCount,
          order_index: tr.orderIndex,
          has_finals: tr.hasFinals,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['racesDirect', raceDayId] });
      void queryClient.invalidateQueries({ queryKey: ['raceDayWithDiv'] });
      setSelectedTemplateId('');
    } catch (err) {
      setTemplateApplyError(err instanceof ApiError ? err.message : 'Failed to apply template');
    } finally {
      setTemplateApplying(false);
    }
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
          <div className="flex items-start justify-between gap-3 mt-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {raceDay?.name ?? 'Race Day'}
            </h1>
            <a
              href={`/p/${raceDayId ?? ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded-lg px-3 py-1.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Public view
            </a>
          </div>
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

          {/* Template application */}
          {isCoordinator && (templatesQuery.data?.templates ?? []).length > 0 && races.length === 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-indigo-800">Apply a template to create races:</p>
              {templateApplyError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {templateApplyError}
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="flex-1 border border-indigo-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-11"
                >
                  <option value="">Select template…</option>
                  {(templatesQuery.data?.templates ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.races.length} races)</option>
                  ))}
                </select>
                <button
                  onClick={() => void handleApplyTemplate()}
                  disabled={!selectedTemplateId || templateApplying}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
                >
                  {templateApplying ? 'Applying…' : 'Apply'}
                </button>
              </div>
            </div>
          )}

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
                          {race.classification?.label ?? 'Open'} · {race.distance?.label ?? '—'}
                        </p>
                        <p className="text-xs text-gray-500">{race.laneCount} lanes</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={race.status} />
                        {isHeadCoach && (race.status === 'setup' || race.status === 'boat_prep') && (() => {
                          const ls = lineupStatusMap.get(race.id);
                          if (ls?.submitted) {
                            return <span className="text-xs font-medium bg-green-100 text-green-700 rounded-full px-2.5 py-1">Lineup ✓</span>;
                          }
                          if (ls?.exists) {
                            return <span className="text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full px-2.5 py-1">Draft</span>;
                          }
                          return <span className="text-xs font-medium bg-gray-100 text-gray-400 rounded-full px-2.5 py-1">No lineup</span>;
                        })()}
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
                        {isCoordinator && (() => {
                          const idx = races.indexOf(race);
                          return (
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => {
                                  const prev = races[idx - 1];
                                  if (prev) reorderMutation.mutate({ raceId: race.id, swapId: prev.id, raceOrder: race.orderIndex, swapOrder: prev.orderIndex });
                                }}
                                disabled={idx === 0 || reorderMutation.isPending}
                                className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none px-1"
                                title="Move up"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => {
                                  const next = races[idx + 1];
                                  if (next) reorderMutation.mutate({ raceId: race.id, swapId: next.id, raceOrder: race.orderIndex, swapOrder: next.orderIndex });
                                }}
                                disabled={idx === races.length - 1 || reorderMutation.isPending}
                                className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none px-1"
                                title="Move down"
                              >
                                ▼
                              </button>
                            </div>
                          );
                        })()}
                        {isCoordinator && (
                          <button
                            onClick={() => {
                              if (window.confirm('Delete this race and all its data? This cannot be undone.')) {
                                deleteRaceMutation.mutate(race.id);
                              }
                            }}
                            disabled={deleteRaceMutation.isPending}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-60 px-2 min-h-11 flex items-center"
                          >
                            Delete
                          </button>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Classification</label>
                <select
                  value={classificationId}
                  onChange={(e) => setClassificationId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                >
                  <option value="">Open (no classification)</option>
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
              {hasFinals && (
                <AdvancementRuleForm
                  ruleType={ruleType}
                  topNPerHeat={topNPerHeat}
                  additionalFastest={additionalFastest}
                  topOverallCount={topOverallCount}
                  onRuleTypeChange={setRuleType}
                  onTopNPerHeatChange={setTopNPerHeat}
                  onAdditionalFastestChange={setAdditionalFastest}
                  onTopOverallCountChange={setTopOverallCount}
                />
              )}
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
