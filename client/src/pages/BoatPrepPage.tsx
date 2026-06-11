import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { listBoats } from '../api/boats.js';
import type { BoatData } from '../api/boats.js';
import type { RaceData } from '../api/races.js';
import { getBroughtBoats, markBoatBrought, unmarkBoatBrought } from '../api/broughtBoats.js';
import type { RaceDayBoatData } from '../api/broughtBoats.js';
import {
  listBoatAssignments,
  assignBoat,
  removeBoatAssignment,
  autoAssignBoats,
  getAvailableBoatsForRace,
} from '../api/boatAssignments.js';
import type { BoatAssignmentData, AvailableBoatData, ConflictLevel } from '../api/boatAssignments.js';
import { listBoatLoans, createBoatLoan, deleteBoatLoan } from '../api/boatLoans.js';
import type { BoatLoanData } from '../api/boatLoans.js';
import { getLineups } from '../api/lineups.js';
import type { LineupData } from '../api/lineups.js';
import { getHeats } from '../api/seeding.js';
import type { HeatData } from '../api/seeding.js';

// ─── Collapsible section wrapper ──────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
      >
        <span>{title}</span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-2 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Conflict badge ────────────────────────────────────────────────────────────

function ConflictBadge({ level }: { level: ConflictLevel }) {
  if (level === '1_heat') {
    return (
      <span className="ml-1 text-orange-700 font-medium text-xs bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
        1 heat away
      </span>
    );
  }
  if (level === '2_heats') {
    return (
      <span className="ml-1 text-yellow-700 font-medium text-xs bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
        2 heats away
      </span>
    );
  }
  return null;
}

// ─── Section 1: Boats We're Bringing ──────────────────────────────────────────

interface BroughtBoatsSectionProps {
  raceDayId: string;
  teamId: string;
  canManage: boolean;
}

function BroughtBoatsSection({ raceDayId, teamId, canManage }: BroughtBoatsSectionProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const boatsQuery = useQuery<{ boats: BoatData[] }, ApiError>({
    queryKey: ['boats', teamId],
    queryFn: () => listBoats(teamId),
    enabled: !!teamId,
  });

  const broughtQuery = useQuery<{ broughtBoats: RaceDayBoatData[] }, ApiError>({
    queryKey: ['broughtBoats', raceDayId],
    queryFn: () => getBroughtBoats(raceDayId),
    enabled: !!raceDayId,
  });

  const markMutation = useMutation({
    mutationFn: (boatId: string) => markBoatBrought(raceDayId, boatId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['broughtBoats', raceDayId] });
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const unmarkMutation = useMutation({
    mutationFn: (boatId: string) => unmarkBoatBrought(raceDayId, boatId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['broughtBoats', raceDayId] });
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const boats = (boatsQuery.data?.boats ?? []).filter((b) => !b.deletedAt && !b.isDouble);
  const broughtIds = new Set(
    (broughtQuery.data?.broughtBoats ?? [])
      .filter((rb) => rb.teamId === teamId)
      .map((rb) => rb.boatId)
  );

  if (boatsQuery.isLoading || broughtQuery.isLoading) {
    return <p className="text-sm text-gray-500">Loading boats…</p>;
  }

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {boats.length === 0 ? (
        <p className="text-sm text-gray-500">No single boats in inventory.</p>
      ) : (
        <ul className="space-y-2">
          {boats.map((boat) => {
            const isBrought = broughtIds.has(boat.id);
            return (
              <li
                key={boat.id}
                className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
              >
                <div className="text-sm">
                  <span className="font-medium text-gray-900">#{boat.number}</span>
                  {boat.model && (
                    <span className="text-gray-500 ml-1.5">{boat.model}</span>
                  )}
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isBrought) {
                        unmarkMutation.mutate(boat.id);
                      } else {
                        markMutation.mutate(boat.id);
                      }
                    }}
                    disabled={markMutation.isPending || unmarkMutation.isPending}
                    className={`text-sm font-medium rounded-lg px-3 py-1.5 min-h-9 transition-colors ${
                      isBrought
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                  >
                    {isBrought ? 'Bringing' : 'Not Bringing'}
                  </button>
                ) : (
                  <span
                    className={`text-xs rounded-full px-2.5 py-1 ${
                      isBrought
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isBrought ? 'Bringing' : 'Not bringing'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ─── Section 2: Boat Assignments per race ─────────────────────────────────────

interface RaceAssignmentsPanelProps {
  race: RaceData;
  teamId: string;
  raceDayId: string;
  canAssign: boolean;
  isHeadCoach: boolean;
}

function conflictLabel(level: ConflictLevel, isLoaned: boolean): string {
  const loanSuffix = isLoaned ? ' [Loan]' : '';
  if (level === '1_heat') return ` ⚠ 1h${loanSuffix}`;
  if (level === '2_heats') return ` · 2h${loanSuffix}`;
  return loanSuffix;
}

function RaceAssignmentsPanel({
  race,
  teamId,
  canAssign,
  isHeadCoach,
}: RaceAssignmentsPanelProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const lineupsQuery = useQuery<{ lineups: LineupData[] }, ApiError>({
    queryKey: ['lineups', race.id],
    queryFn: () => getLineups(race.id),
    enabled: !!race.id,
  });

  const assignmentsQuery = useQuery<{ assignments: BoatAssignmentData[] }, ApiError>({
    queryKey: ['boatAssignments', race.id],
    queryFn: () => listBoatAssignments(race.id),
    enabled: !!race.id,
  });

  const availableBoatsQuery = useQuery<{ boats: AvailableBoatData[] }, ApiError>({
    queryKey: ['availableBoats', race.id, teamId],
    queryFn: () => getAvailableBoatsForRace(race.id, teamId),
    enabled: !!race.id && !!teamId,
  });

  // Heats give us per-heat grouping and lane numbers
  const heatsQuery = useQuery<{ heats: HeatData[] }, ApiError>({
    queryKey: ['heats', race.id],
    queryFn: () => getHeats(race.id),
    enabled: !!race.id,
  });

  const assignMutation = useMutation({
    mutationFn: ({ entryId, boatId }: { entryId: string; boatId: string }) =>
      assignBoat(race.id, entryId, boatId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boatAssignments', race.id] });
      void queryClient.invalidateQueries({ queryKey: ['availableBoats', race.id, teamId] });
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (entryId: string) => removeBoatAssignment(race.id, entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boatAssignments', race.id] });
      void queryClient.invalidateQueries({ queryKey: ['availableBoats', race.id, teamId] });
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const autoAssignMutation = useMutation({
    mutationFn: () => autoAssignBoats(race.id, teamId, true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boatAssignments', race.id] });
      void queryClient.invalidateQueries({ queryKey: ['availableBoats', race.id, teamId] });
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  // map entryId → { heatNumber, lane } (populated after seeding)
  const entryHeatInfo = useMemo(() => {
    const map = new Map<string, { heatNumber: number; lane: number }>();
    for (const heat of heatsQuery.data?.heats ?? []) {
      for (const la of heat.laneAssignments) {
        map.set(la.entry.id, { heatNumber: heat.heatNumber, lane: la.lane });
      }
    }
    return map;
  }, [heatsQuery.data]);

  const heatsSeeded = entryHeatInfo.size > 0;

  const lineup = lineupsQuery.data?.lineups.find((l) => l.teamId === teamId);
  if (!lineup) {
    return <p className="text-sm text-gray-400 italic">No lineup submitted for this race.</p>;
  }

  const assignmentMap = new Map<string, BoatAssignmentData>(
    (assignmentsQuery.data?.assignments ?? []).map((a) => [a.entryId, a])
  );

  const availableBoatOptions = (availableBoatsQuery.data?.boats ?? []).map((b) => ({
    id: b.id,
    label: `#${b.number}${b.model ? ` (${b.model})` : ''}${conflictLabel(b.conflictLevel, b.isLoaned)}`,
    conflictLevel: b.conflictLevel,
  }));

  const entries = lineup.entries;
  const singleEntries = entries.filter((e) => !e.pairId);
  const doublesEntries = entries.filter((e) => e.pairId);

  // Group single entries by heat (or a single flat group when not yet seeded)
  const heatGroups = useMemo(() => {
    if (!heatsSeeded) return null;
    const groups = new Map<number, typeof singleEntries>();
    const unassigned: typeof singleEntries = [];
    for (const entry of singleEntries) {
      const info = entryHeatInfo.get(entry.id);
      if (info) {
        const existing = groups.get(info.heatNumber) ?? [];
        groups.set(info.heatNumber, [...existing, entry]);
      } else {
        unassigned.push(entry);
      }
    }
    return { groups, unassigned };
  }, [singleEntries, entryHeatInfo, heatsSeeded]);

  const seenPairIds = new Set<string>();
  const uniqueDoublesPairs = doublesEntries.filter((e) => {
    if (!e.pairId || seenPairIds.has(e.pairId)) return false;
    seenPairIds.add(e.pairId);
    return true;
  });

  function renderEntryRow(entry: (typeof singleEntries)[0]) {
    const assignment = assignmentMap.get(entry.id);
    const heatInfo = entryHeatInfo.get(entry.id);
    return (
      <div
        key={entry.id}
        className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-800 truncate block">
            {entry.athlete.name}
            {heatInfo && !heatsSeeded && (
              <span className="text-xs text-gray-400 ml-1">Lane {heatInfo.lane}</span>
            )}
          </span>
          {assignment && assignment.conflictLevel !== 'none' && (
            <ConflictBadge level={assignment.conflictLevel} />
          )}
        </div>
        {canAssign ? (
          <select
            value={assignment?.boatId ?? ''}
            onChange={(e) => {
              const boatId = e.target.value;
              if (!boatId) {
                if (assignment) removeMutation.mutate(entry.id);
              } else {
                assignMutation.mutate({ entryId: entry.id, boatId });
              }
            }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11 min-w-[140px] flex-shrink-0"
          >
            <option value="">Unassigned</option>
            {availableBoatOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-gray-500 flex-shrink-0">
            {assignment
              ? `#${assignment.boat.number}${assignment.boat.model ? ` (${assignment.boat.model})` : ''}`
              : 'Unassigned'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">
          {race.classification?.label} &middot; {race.distance?.label}
        </h4>
        {isHeadCoach && singleEntries.length > 0 && (
          <button
            type="button"
            onClick={() => autoAssignMutation.mutate()}
            disabled={autoAssignMutation.isPending}
            className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-3 py-2 min-h-9 transition-colors"
          >
            {autoAssignMutation.isPending ? 'Assigning…' : 'Auto-Assign Singles'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-sm text-gray-400 italic">No entries in lineup.</p>
      )}

      {/* Singles — grouped by heat once seeded, flat list before seeding */}
      {singleEntries.length > 0 && (
        <div className="space-y-3">
          {!heatsSeeded ? (
            <>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Singles{heatsQuery.isLoading ? '' : ' (heats not yet generated)'}
              </p>
              <div className="space-y-2">
                {singleEntries.map(renderEntryRow)}
              </div>
            </>
          ) : (
            <>
              {[...(heatGroups!.groups.entries())]
                .sort(([a], [b]) => a - b)
                .map(([heatNumber, heatEntries]) => (
                  <div key={heatNumber} className="space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Heat {heatNumber}
                    </p>
                    {heatEntries
                      .slice()
                      .sort((a, b) => {
                        const la = entryHeatInfo.get(a.id)?.lane ?? 0;
                        const lb = entryHeatInfo.get(b.id)?.lane ?? 0;
                        return la - lb;
                      })
                      .map((entry) => {
                        const assignment = assignmentMap.get(entry.id);
                        const heatInfo = entryHeatInfo.get(entry.id);
                        return (
                          <div
                            key={entry.id}
                            className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
                          >
                            {heatInfo && (
                              <span className="text-xs text-gray-400 w-10 flex-shrink-0 tabular-nums">
                                L{heatInfo.lane}
                              </span>
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-gray-800 truncate block">
                                {entry.athlete.name}
                              </span>
                              {assignment && assignment.conflictLevel !== 'none' && (
                                <ConflictBadge level={assignment.conflictLevel} />
                              )}
                            </div>
                            {canAssign ? (
                              <select
                                value={assignment?.boatId ?? ''}
                                onChange={(e) => {
                                  const boatId = e.target.value;
                                  if (!boatId) {
                                    if (assignment) removeMutation.mutate(entry.id);
                                  } else {
                                    assignMutation.mutate({ entryId: entry.id, boatId });
                                  }
                                }}
                                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11 min-w-[140px] flex-shrink-0"
                              >
                                <option value="">Unassigned</option>
                                {availableBoatOptions.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-gray-500 flex-shrink-0">
                                {assignment
                                  ? `#${assignment.boat.number}${assignment.boat.model ? ` (${assignment.boat.model})` : ''}`
                                  : 'Unassigned'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ))}
              {heatGroups!.unassigned.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Not yet in a heat
                  </p>
                  {heatGroups!.unassigned.map(renderEntryRow)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Doubles */}
      {uniqueDoublesPairs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Doubles</p>
          {uniqueDoublesPairs.map((entry) => {
            const partner = doublesEntries.find(
              (e) => e.pairId === entry.pairId && e.id !== entry.id
            );
            return (
              <div
                key={entry.pairId}
                className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
              >
                <span className="text-sm text-gray-800">
                  {entry.athlete.name}
                  {partner ? ` & ${partner.athlete.name}` : ''}
                </span>
                <span className="text-xs text-gray-400 italic">Manual assignment required</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Boat Loans ────────────────────────────────────────────────────

interface BoatLoansSectionProps {
  races: RaceData[];
  raceDayId: string;
  teamId: string;
  isHeadCoach: boolean;
  divisionId: string;
}

function BoatLoansSection({
  races,
  raceDayId,
  teamId,
  isHeadCoach,
  divisionId,
}: BoatLoansSectionProps) {
  const queryClient = useQueryClient();
  const [loanBoatId, setLoanBoatId] = useState('');
  const [loanRaceId, setLoanRaceId] = useState('');
  const [loanToTeamId, setLoanToTeamId] = useState('');
  const [loanError, setLoanError] = useState('');

  // Fetch brought boats for the race day (to list available boats to loan)
  const broughtQuery = useQuery<{ broughtBoats: RaceDayBoatData[] }, ApiError>({
    queryKey: ['broughtBoats', raceDayId],
    queryFn: () => getBroughtBoats(raceDayId),
    enabled: !!raceDayId,
  });

  // Fetch all loans for all races
  const loansQueries = races.map((race) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery<{ loans: BoatLoanData[] }, ApiError>({
      queryKey: ['boatLoans', race.id],
      queryFn: () => listBoatLoans(race.id),
    })
  );

  // Fetch teams in division for "loan to" dropdown
  const teamsQuery = useQuery<{ teams: { id: string; name: string }[] }, ApiError>({
    queryKey: ['teamsInDivision', divisionId],
    queryFn: async () => {
      const res = await fetch(`/api/teams?divisionId=${divisionId}`, { credentials: 'include' });
      if (!res.ok) throw new ApiError(res.status, 'Failed to load teams');
      return res.json() as Promise<{ teams: { id: string; name: string }[] }>;
    },
    enabled: isHeadCoach && !!divisionId,
  });

  const allLoans = loansQueries.flatMap((q) => q.data?.loans ?? []);
  const outgoingLoans = allLoans.filter((l) => l.fromTeamId === teamId);

  const myBroughtBoats = (broughtQuery.data?.broughtBoats ?? []).filter(
    (rb) => rb.teamId === teamId
  );

  const createMutation = useMutation({
    mutationFn: ({ raceId, boatId, toTeamId }: { raceId: string; boatId: string; toTeamId: string }) =>
      createBoatLoan(raceId, { boat_id: boatId, to_team_id: toTeamId }),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['boatLoans', vars.raceId] });
      setLoanBoatId('');
      setLoanRaceId('');
      setLoanToTeamId('');
      setLoanError('');
    },
    onError: (err: ApiError) => setLoanError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ raceId, loanId }: { raceId: string; loanId: string }) =>
      deleteBoatLoan(raceId, loanId),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['boatLoans', vars.raceId] });
    },
    onError: (err: ApiError) => setLoanError(err.message),
  });

  const otherTeams = (teamsQuery.data?.teams ?? []).filter((t) => t.id !== teamId);

  // Find the next race name for selected loan boat and race
  const selectedRaceIndex = loanRaceId
    ? races.findIndex((r) => r.id === loanRaceId)
    : -1;
  const nextRace =
    selectedRaceIndex >= 0 && selectedRaceIndex < races.length - 1
      ? races[selectedRaceIndex + 1]
      : null;

  return (
    <div className="space-y-4">
      {/* Existing outgoing loans */}
      {outgoingLoans.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Current Outgoing Loans
          </p>
          {outgoingLoans.map((loan) => {
            const loanRace = races.find((r) => r.id === loan.raceId);
            return (
              <div
                key={loan.id}
                className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
              >
                <div className="text-sm">
                  <span className="font-medium text-gray-800">
                    #{loan.boat.number}
                    {loan.boat.model ? ` (${loan.boat.model})` : ''}
                  </span>
                  <span className="text-gray-500 mx-1.5">to</span>
                  <span className="text-gray-800">{loan.toTeam.name}</span>
                  {loanRace && (
                    <span className="text-gray-500 ml-1.5">
                      for {loanRace.classification?.label} {loanRace.distance?.label}
                    </span>
                  )}
                </div>
                {isHeadCoach && (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate({ raceId: loan.raceId, loanId: loan.id })}
                    disabled={deleteMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-700 min-h-8 px-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Loan creation form (head coach only) */}
      {isHeadCoach && (
        <div className="space-y-3 border border-gray-200 rounded-lg p-3">
          <p className="text-sm font-medium text-gray-700">Loan a Boat</p>
          {loanError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {loanError}
            </div>
          )}
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Boat</label>
              <select
                value={loanBoatId}
                onChange={(e) => setLoanBoatId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              >
                <option value="">Select boat…</option>
                {myBroughtBoats.map((rb) => (
                  <option key={rb.boatId} value={rb.boatId}>
                    #{rb.boat.number}
                    {rb.boat.model ? ` (${rb.boat.model})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Race</label>
              <select
                value={loanRaceId}
                onChange={(e) => setLoanRaceId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              >
                <option value="">Select race…</option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.classification?.label} &middot; {r.distance?.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Loan to Team</label>
              <select
                value={loanToTeamId}
                onChange={(e) => setLoanToTeamId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              >
                <option value="">Select team…</option>
                {otherTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            {nextRace && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg px-3 py-2 text-xs">
                Note: This boat cannot be used in the immediately following race (
                {nextRace.classification?.label} &middot; {nextRace.distance?.label}).
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!loanBoatId || !loanRaceId || !loanToTeamId) {
                setLoanError('Select boat, race, and receiving team');
                return;
              }
              createMutation.mutate({
                raceId: loanRaceId,
                boatId: loanBoatId,
                toTeamId: loanToTeamId,
              });
            }}
            disabled={createMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
          >
            {createMutation.isPending ? 'Creating Loan…' : 'Create Loan'}
          </button>
        </div>
      )}

      {outgoingLoans.length === 0 && !isHeadCoach && (
        <p className="text-sm text-gray-400 italic">No outgoing loans.</p>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BoatPrepPage() {
  const { raceDayId } = useParams<{ raceDayId: string }>();
  const { memberships } = useAuthContext();

  // Determine user's team
  const coachMembership = memberships.find(
    (m) => m.role === 'head_coach' && m.teamId
  );
  const assistantMembership = memberships.find(
    (m) => m.role === 'assistant_coach' && m.teamId
  );
  const teamMembership = coachMembership ?? assistantMembership;
  const teamId = teamMembership?.teamId ?? null;
  const isHeadCoach = !!coachMembership;

  const perms = (teamMembership?.permissions ?? {}) as Record<string, boolean>;
  const canManageBoatInventory =
    isHeadCoach || (teamMembership?.role === 'assistant_coach' && !!perms['boat_inventory']);
  const canManageBoatAssignments =
    isHeadCoach || (teamMembership?.role === 'assistant_coach' && !!perms['boat_assignments']);

  // Determine divisionId from memberships
  const divisionId =
    coachMembership?.team
      ? memberships.find(
          (m) =>
            m.role === 'coordinator' ||
            (m.teamId === teamId && m.divisionId)
        )?.divisionId ?? ''
      : memberships.find((m) => m.divisionId)?.divisionId ?? '';

  // Get team's division from team data
  const coordinatorMembership = memberships.find((m) => m.role === 'coordinator');
  const effectiveDivisionId = coordinatorMembership?.divisionId ?? divisionId;

  const racesQuery = useQuery<{ races: RaceData[] }, ApiError>({
    queryKey: ['races', raceDayId],
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

  const races = (racesQuery.data?.races ?? []).slice().sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  // Find races where this team has a submitted lineup
  const lineupsQueries = races.map((r) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery<{ lineups: LineupData[] }, ApiError>({
      queryKey: ['lineups', r.id],
      queryFn: () => getLineups(r.id),
      enabled: !!r.id && !!teamId,
    })
  );

  const racesWithLineup = races.filter((_race, i) => {
    const lineups = lineupsQueries[i]?.data?.lineups ?? [];
    return lineups.some((l) => l.teamId === teamId);
  });

  if (!teamId) {
    return (
      <Layout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Boat Prep</h1>
          <p className="text-gray-500">You are not a member of any team.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div>
          <Link
            to={`/race-days/${raceDayId ?? ''}`}
            className="text-blue-600 hover:underline text-sm"
          >
            &larr; Race Day
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Boat Prep</h1>
          <p className="text-sm text-gray-500">{teamMembership?.team?.name ?? 'My Team'}</p>
        </div>

        {/* Section 1: Boats We're Bringing */}
        <Section title="Boats We're Bringing">
          <BroughtBoatsSection
            raceDayId={raceDayId!}
            teamId={teamId}
            canManage={canManageBoatInventory}
          />
        </Section>

        {/* Section 2: Boat Assignments per race */}
        <Section title="Boat Assignments" defaultOpen={true}>
          {racesQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : races.length === 0 ? (
            <p className="text-sm text-gray-500">No races scheduled.</p>
          ) : racesWithLineup.length === 0 ? (
            <p className="text-sm text-gray-500">No races with a submitted lineup.</p>
          ) : (
            <div className="space-y-5">
              {racesWithLineup.map((race) => (
                <RaceAssignmentsPanel
                  key={race.id}
                  race={race}
                  teamId={teamId}
                  raceDayId={raceDayId!}
                  canAssign={canManageBoatAssignments}
                  isHeadCoach={isHeadCoach}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Section 3: Boat Loans (head coach only) */}
        {isHeadCoach && (
          <Section title="Boat Loans" defaultOpen={false}>
            <BoatLoansSection
              races={races}
              raceDayId={raceDayId!}
              teamId={teamId}
              isHeadCoach={isHeadCoach}
              divisionId={effectiveDivisionId}
            />
          </Section>
        )}
      </div>
    </Layout>
  );
}
