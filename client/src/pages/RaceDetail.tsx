import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { getRaceInfo } from '../api/races.js';
import type { RaceResponse } from '../api/races.js';
import {
  getLineups,
  getOrCreateLineup,
  submitLineup,
  unsubmitLineup,
  getLineupEntries,
  bulkAddLineupEntries,
  removeLineupEntry,
} from '../api/lineups.js';
import type { LineupData, LineupEntry } from '../api/lineups.js';
import {
  listSubstitutions,
  requestSubstitution,
  reviewSubstitution,
} from '../api/substitutions.js';
import type { SubstitutionData } from '../api/substitutions.js';
import { listScratches, scratchAthlete, unScratch } from '../api/scratches.js';
import type { ScratchData } from '../api/scratches.js';
import { listAthletes } from '../api/athletes.js';
import type { AthleteData } from '../api/athletes.js';
import { getHeats } from '../api/seeding.js';
import type { HeatData } from '../api/seeding.js';

function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const secs = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return `${minutes}:${secs}`;
}

interface LineupPanelProps {
  raceId: string;
  lineup: LineupData;
  isCoach: boolean;
  athletes: AthleteData[];
  raceClassificationId: string | null;
  raceDistanceId: string | null;
  raceStatus: string | null;
  onRefresh: () => void;
}

function LineupPanel({ raceId, lineup, isCoach, athletes, raceClassificationId, raceDistanceId, raceStatus, onRefresh }: LineupPanelProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [entryMessage, setEntryMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const entriesQuery = useQuery<{ entries: LineupEntry[] }, ApiError>({
    queryKey: ['entries', raceId, lineup.teamId],
    queryFn: () => getLineupEntries(raceId, lineup.teamId),
  });

  const bulkAddMutation = useMutation({
    mutationFn: (ids: string[]) =>
      bulkAddLineupEntries(raceId, lineup.teamId, { athlete_ids: ids }),
    onSuccess: ({ errors }) => {
      void queryClient.invalidateQueries({ queryKey: ['entries', raceId, lineup.teamId] });
      void queryClient.invalidateQueries({ queryKey: ['lineups', raceId] });
      setSelectedIds(new Set());
      if (errors.length > 0) {
        setEntryMessage({ text: `${errors.length} athlete(s) could not be added (already entered today).`, isError: false });
      } else {
        setEntryMessage(null);
      }
      onRefresh();
    },
    onError: (err: ApiError) => setEntryMessage({ text: err.message, isError: true }),
  });

  const removeMutation = useMutation({
    mutationFn: (entryId: string) => removeLineupEntry(raceId, lineup.teamId, entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries', raceId, lineup.teamId] });
      void queryClient.invalidateQueries({ queryKey: ['lineups', raceId] });
      onRefresh();
    },
    onError: (err: ApiError) => setEntryMessage({ text: err.message, isError: true }),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitLineup(raceId, lineup.teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lineups', raceId] });
      onRefresh();
    },
    onError: (err: ApiError) => setEntryMessage({ text: err.message, isError: true }),
  });

  const unsubmitMutation = useMutation({
    mutationFn: () => unsubmitLineup(raceId, lineup.teamId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lineups', raceId] });
      onRefresh();
    },
    onError: (err: ApiError) => setEntryMessage({ text: err.message, isError: true }),
  });

  const toggleAthlete = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const entries = entriesQuery.data?.entries ?? lineup.entries;
  const enteredAthleteIds = new Set(entries.map((e) => e.athleteId));
  // Filter by classification: null means open (all athletes eligible)
  const classificationFiltered = raceClassificationId
    ? athletes.filter((a) => a.classificationId === raceClassificationId)
    : athletes;
  const availableAthletes = classificationFiltered.filter((a) => !enteredAthleteIds.has(a.id));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{lineup.team.name}</h3>
        {lineup.submitted ? (
          <span className="text-xs bg-green-100 text-green-700 rounded-full px-2.5 py-1 font-medium">
            Submitted
          </span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2.5 py-1">
            Draft
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">No athletes entered.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-800">{entry.athlete.name}</span>
              {isCoach && !lineup.submitted && (
                <button
                  onClick={() => removeMutation.mutate(entry.id)}
                  disabled={removeMutation.isPending}
                  className="text-xs text-red-500 hover:text-red-700 px-2 min-h-8"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {entryMessage && (
        <div className={`rounded-lg px-3 py-2 text-xs border ${entryMessage.isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
          {entryMessage.text}
        </div>
      )}

      {isCoach && !lineup.submitted && (
        <div className="space-y-2">
          {availableAthletes.length > 0 && (
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Select athletes to add
              {raceDistanceId && <span className="normal-case font-normal ml-1">— showing best times for this race distance</span>}
            </p>
          )}
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {availableAthletes.length === 0 ? (
              <p className="text-sm text-gray-400">All athletes are in the lineup.</p>
            ) : (
              availableAthletes.map((a) => {
                const bestTime = raceDistanceId
                  ? a.bestTimes.find((bt) => bt.distanceId === raceDistanceId)
                  : undefined;
                const timeLabel = bestTime ? formatTime(bestTime.timeMs) : 'No time';
                const isSelected = selectedIds.has(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAthlete(a.id)}
                    className={`w-full text-left border rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`font-medium ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                          {a.name}
                        </span>
                        {a.grade && (
                          <span className="text-xs text-gray-400 ml-1.5">Gr.&nbsp;{a.grade}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-mono ${bestTime ? 'text-gray-600' : 'text-gray-300'}`}>
                          {timeLabel}
                        </span>
                        {isSelected && (
                          <span className="text-blue-500 font-semibold text-sm">✓</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={() => bulkAddMutation.mutate([...selectedIds])}
              disabled={bulkAddMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
            >
              {bulkAddMutation.isPending
                ? 'Adding…'
                : `Add ${selectedIds.size} athlete${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {isCoach && (
        <div>
          {lineup.submitted ? (
            !['live', 'review', 'published'].includes(raceStatus ?? '') && (
              <button
                onClick={() => unsubmitMutation.mutate()}
                disabled={unsubmitMutation.isPending}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
              >
                {unsubmitMutation.isPending ? 'Unsubmitting…' : 'Un-submit Lineup'}
              </button>
            )
          ) : (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || entries.length === 0}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
            >
              {submitMutation.isPending ? 'Submitting…' : 'Submit Lineup'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function RaceDetail() {
  const { raceId } = useParams<{ raceId: string }>();
  const { memberships, user } = useAuthContext();
  const queryClient = useQueryClient();

  const [subOutAthlete, setSubOutAthlete] = useState('');
  const [subInAthlete, setSubInAthlete] = useState('');
  const [subError, setSubError] = useState('');
  const [scratchAthleteSel, setScratchAthleteSel] = useState('');
  const [scratchError, setScratchError] = useState('');

  // Fetch race metadata (status, classification, raceDayId, etc.)
  const raceMetaQuery = useQuery<RaceResponse, ApiError>({
    queryKey: ['race-meta', raceId],
    queryFn: () => getRaceInfo(raceId!),
    enabled: !!raceId,
  });

  const heatsQuery = useQuery<{ heats: HeatData[] }, ApiError>({
    queryKey: ['heats', raceId],
    queryFn: () => getHeats(raceId!),
    enabled: !!raceId,
  });

  const lineupsQuery = useQuery<{ lineups: LineupData[] }, ApiError>({
    queryKey: ['lineups', raceId],
    queryFn: () => getLineups(raceId!),
    enabled: !!raceId,
  });

  const substitutionsQuery = useQuery<{ substitutions: SubstitutionData[] }, ApiError>({
    queryKey: ['substitutions', raceId],
    queryFn: () => listSubstitutions(raceId!),
    enabled: !!raceId,
  });

  const scratchesQuery = useQuery<{ scratches: ScratchData[] }, ApiError>({
    queryKey: ['scratches', raceId],
    queryFn: () => listScratches(raceId!),
    enabled: !!raceId,
  });

  // Get the user's team from memberships
  const coachMembership = memberships.find((m) => m.role === 'head_coach' && m.teamId);
  const myTeamId = coachMembership?.teamId ?? null;
  const myTeam = coachMembership?.team ?? null;

  // Fetch athletes for the user's team (for lineup management)
  const athletesQuery = useQuery<{ athletes: AthleteData[] }, ApiError>({
    queryKey: ['athletes', myTeamId],
    queryFn: () => listAthletes(myTeamId!),
    enabled: !!myTeamId,
  });

  // Check if user is a coordinator (from memberships)
  const isCoordinator = memberships.some((m) => m.role === 'coordinator');
  const isHeadCoach = !!myTeamId;

  // Get or create lineup for the coach's team
  const myLineupMutation = useMutation({
    mutationFn: () => getOrCreateLineup(raceId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lineups', raceId] });
    },
  });

  const myLineup = lineupsQuery.data?.lineups.find((l) => l.teamId === myTeamId);

  // Substitution request
  const subMutation = useMutation({
    mutationFn: (data: { out_athlete_id: string; in_athlete_id: string }) =>
      requestSubstitution(raceId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['substitutions', raceId] });
      setSubOutAthlete('');
      setSubInAthlete('');
      setSubError('');
    },
    onError: (err: ApiError) => setSubError(err.message),
  });

  const handleSubRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subOutAthlete || !subInAthlete) { setSubError('Select both athletes'); return; }
    subMutation.mutate({ out_athlete_id: subOutAthlete, in_athlete_id: subInAthlete });
  };

  // Review substitution (primary official)
  const reviewMutation = useMutation({
    mutationFn: ({ subId, status }: { subId: string; status: 'approved' | 'rejected' }) =>
      reviewSubstitution(raceId!, subId, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['substitutions', raceId] });
    },
  });

  // Scratch
  const scratchMutation = useMutation({
    mutationFn: (athleteId: string) => scratchAthlete(raceId!, { athlete_id: athleteId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scratches', raceId] });
      setScratchAthleteSel('');
      setScratchError('');
    },
    onError: (err: ApiError) => setScratchError(err.message),
  });

  const unScratchMutation = useMutation({
    mutationFn: (scratchId: string) => unScratch(raceId!, scratchId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scratches', raceId] });
    },
    onError: (err: ApiError) => setScratchError(err.message),
  });

  const lineups = lineupsQuery.data?.lineups ?? [];
  const raceDistanceId = lineupsQuery.data?.race?.distanceId ?? null;
  const substitutions = substitutionsQuery.data?.substitutions ?? [];
  const scratches = scratchesQuery.data?.scratches ?? [];
  const athletes = athletesQuery.data?.athletes ?? [];
  const heats = heatsQuery.data?.heats ?? [];
  const raceStatus = raceMetaQuery.data?.race.status ?? null;
  const raceMeta = raceMetaQuery.data?.race ?? null;
  const raceDayId = raceMeta?.raceDayId;

  // Find if current user is the primary official for this race day
  // We determine this by checking substitutions where the user reviewed them
  // (We don't have a direct way without fetching race day — simplification: show review UI for officials)
  const isOfficialOrCoordinator = isCoordinator || memberships.some((m) => m.role === 'official');

  const myLineupEntries = myLineup?.entries ?? [];
  const scratchedAthleteIds = new Set(
    scratches.filter((s) => s.teamId === myTeamId).map((s) => s.athleteId)
  );
  const enteredAthleteIds = new Set(myLineupEntries.map((e) => e.athleteId));
  const scratchableAthletes = athletes.filter(
    (a) => enteredAthleteIds.has(a.id) && !scratchedAthleteIds.has(a.id)
  );

  if (lineupsQuery.isLoading) {
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
          <Link
            to={`/race-days/${raceDayId ?? ''}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Race</h1>
          {raceMeta?.classification && raceMeta?.distance && (
            <p className="text-sm text-gray-500">{raceMeta.classification.label} · {raceMeta.distance.label}</p>
          )}
          {raceStatus && (
            <span className={`inline-block mt-1 text-xs font-medium rounded-full px-2.5 py-1 ${
              raceStatus === 'live' ? 'bg-green-100 text-green-700' :
              raceStatus === 'seeded' ? 'bg-blue-100 text-blue-700' :
              raceStatus === 'setup' ? 'bg-gray-100 text-gray-600' :
              raceStatus === 'boat_prep' ? 'bg-yellow-100 text-yellow-700' :
              raceStatus === 'review' ? 'bg-orange-100 text-orange-700' :
              raceStatus === 'published' ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {raceStatus}
            </span>
          )}
        </div>

        {/* Seeded / live CTA: show heat start buttons prominently */}
        {(raceStatus === 'seeded' || raceStatus === 'live') && heats.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-700">
              {raceStatus === 'seeded' ? 'Ready to race — open officiating' : 'Live Heats'}
            </h2>
            <div className="flex flex-wrap gap-2">
              {heats
                .slice()
                .sort((a, b) => a.heatNumber - b.heatNumber)
                .map((heat) => (
                  <Link
                    key={heat.id}
                    to={`/heats/${heat.id}/officiate?raceId=${raceId ?? ''}${raceDayId ? `&raceDayId=${raceDayId}` : ''}`}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl px-5 py-3 text-sm min-h-11 transition-colors"
                  >
                    Start Heat {heat.heatNumber} →
                  </Link>
                ))}
            </div>
          </section>
        )}

        {/* Navigation links */}
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/races/${raceId}/heats${raceDayId ? `?raceDayId=${raceDayId}` : ''}`}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            View Heat Sheet
          </Link>
          {(raceStatus === 'review' || raceStatus === 'published') && (
            <Link
              to={`/races/${raceId}/results`}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              Results
            </Link>
          )}
          {(raceStatus === 'review' || raceStatus === 'published') && raceMeta?.hasFinals && (
            <Link
              to={`/races/${raceId}/finals`}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
            >
              Finals
            </Link>
          )}
        </div>

        {/* Head coach: get/create lineup button */}
        {isHeadCoach && !myLineup && (
          <button
            onClick={() => myLineupMutation.mutate()}
            disabled={myLineupMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
          >
            {myLineupMutation.isPending ? 'Loading…' : `Open Lineup for ${myTeam?.name ?? 'My Team'}`}
          </button>
        )}

        {/* Lineups section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Lineups</h2>

          {lineups.length === 0 ? (
            <p className="text-sm text-gray-500">No lineups yet.</p>
          ) : isCoordinator ? (
            // Coordinator sees all lineups (read-only)
            lineups.map((lineup) => (
              <LineupPanel
                key={lineup.id}
                raceId={raceId!}
                lineup={lineup}
                isCoach={false}
                athletes={[]}
                raceClassificationId={raceMeta?.classificationId ?? null}
                raceDistanceId={raceDistanceId}
                raceStatus={raceStatus}
                onRefresh={() => void queryClient.invalidateQueries({ queryKey: ['lineups', raceId] })}
              />
            ))
          ) : myLineup ? (
            // Head coach sees own lineup with edit capability
            <LineupPanel
              key={myLineup.id}
              raceId={raceId!}
              lineup={myLineup}
              isCoach={true}
              athletes={athletes}
              raceClassificationId={raceMeta?.classificationId ?? null}
              raceDistanceId={raceDistanceId}
              raceStatus={raceStatus}
              onRefresh={() => void queryClient.invalidateQueries({ queryKey: ['lineups', raceId] })}
            />
          ) : null}
        </section>

        {/* Substitution request form (head coach) */}
        {isHeadCoach && myLineup && myLineupEntries.length > 0 && !['live', 'review', 'published'].includes(raceStatus ?? '') && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Request Substitution</h2>
            <form onSubmit={handleSubRequest} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              {subError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {subError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remove (out)</label>
                <select
                  value={subOutAthlete}
                  onChange={(e) => setSubOutAthlete(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                >
                  <option value="">Select athlete to remove…</option>
                  {myLineupEntries.map((e) => (
                    <option key={e.athleteId} value={e.athleteId}>{e.athlete.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Add (in)</label>
                <select
                  value={subInAthlete}
                  onChange={(e) => setSubInAthlete(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                >
                  <option value="">Select replacement athlete…</option>
                  {athletes
                    .filter((a) => !myLineupEntries.some((e) => e.athleteId === a.id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={subMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
              >
                {subMutation.isPending ? 'Requesting…' : 'Request Substitution'}
              </button>
            </form>
          </section>
        )}

        {/* Substitutions list */}
        {(isOfficialOrCoordinator || isHeadCoach) && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Substitutions</h2>
            {substitutions.length === 0 ? (
              <p className="text-sm text-gray-500">No substitution requests.</p>
            ) : (
              <ul className="space-y-2">
                {substitutions.map((sub) => (
                  <li key={sub.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm">
                        <p className="font-medium text-gray-800">{sub.team.name}</p>
                        <p className="text-gray-600">
                          Out: {sub.outAthlete.name} → In: {sub.inAthlete.name}
                        </p>
                        <span className={`text-xs rounded-full px-2 py-0.5 ${
                          sub.status === 'approved' ? 'bg-green-100 text-green-700' :
                          sub.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {sub.status}
                        </span>
                      </div>
                      {/* Primary official can approve/reject pending subs */}
                      {isOfficialOrCoordinator && sub.status === 'pending' && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => reviewMutation.mutate({ subId: sub.id, status: 'approved' })}
                            disabled={reviewMutation.isPending}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-2 min-h-8"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => reviewMutation.mutate({ subId: sub.id, status: 'rejected' })}
                            disabled={reviewMutation.isPending}
                            className="text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-2 min-h-8"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Scratches section */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">Scratches</h2>

          {isHeadCoach && scratchableAthletes.length > 0 && !['live', 'review', 'published'].includes(raceStatus ?? '') && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              {scratchError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {scratchError}
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={scratchAthleteSel}
                  onChange={(e) => setScratchAthleteSel(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                >
                  <option value="">Scratch athlete…</option>
                  {scratchableAthletes.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (scratchAthleteSel) scratchMutation.mutate(scratchAthleteSel);
                  }}
                  disabled={!scratchAthleteSel || scratchMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium rounded-lg px-3 py-2 text-sm min-h-11 transition-colors"
                >
                  Scratch
                </button>
              </div>
            </div>
          )}

          {scratches.length === 0 ? (
            <p className="text-sm text-gray-500">No scratches.</p>
          ) : (
            <ul className="space-y-2">
              {scratches.map((s) => (
                <li key={s.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="text-sm">
                    <p className="font-medium text-gray-800">{s.athlete.name}</p>
                    <p className="text-xs text-gray-500">{s.team.name}</p>
                  </div>
                  {isHeadCoach && s.teamId === myTeamId && (
                    <button
                      onClick={() => unScratchMutation.mutate(s.id)}
                      disabled={unScratchMutation.isPending}
                      className="text-xs text-blue-600 hover:text-blue-800 min-h-8 px-2"
                    >
                      Un-scratch
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* User info footer (debugging aid) */}
        <div className="text-xs text-gray-400 mt-4">
          Viewing as: {user?.name ?? 'unknown'}{isCoordinator ? ' (coordinator)' : ''}{isHeadCoach ? ` (head coach of ${myTeam?.name})` : ''}
        </div>
      </div>
    </Layout>
  );
}
