import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { apiFetch, ApiError } from '../api/client.js';
import { listBoats } from '../api/boats.js';
import type { BoatData } from '../api/boats.js';
import { listAthletes } from '../api/athletes.js';
import type { AthleteData } from '../api/athletes.js';
import type { RaceData } from '../api/races.js';
import { getBroughtBoats, markBoatBrought, unmarkBoatBrought } from '../api/broughtBoats.js';
import type { RaceDayBoatData } from '../api/broughtBoats.js';
import {
  listBoatAssignments,
  assignBoat,
  removeBoatAssignment,
  autoAssignBoats,
} from '../api/boatAssignments.js';
import type { BoatAssignmentData, ConflictLevel } from '../api/boatAssignments.js';
import { listBoatLoans, createBoatLoan, deleteBoatLoan } from '../api/boatLoans.js';
import type { BoatLoanData } from '../api/boatLoans.js';
import { getLineups } from '../api/lineups.js';
import type { LineupData } from '../api/lineups.js';

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

// ─── Conflict level badge ──────────────────────────────────────────────────────

function ConflictLevelBadge({ level }: { level: ConflictLevel }) {
  if (level === 'none') {
    return (
      <span className="ml-1 text-green-700 font-medium text-xs bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
        Available
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
  if (level === '1_heat') {
    return (
      <span className="ml-1 text-orange-700 font-medium text-xs bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
        1 heat away
      </span>
    );
  }
  return (
    <span className="ml-1 text-red-700 font-medium text-xs bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
      Unavailable
    </span>
  );
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
                  {boat.boatModel && (
                    <span className="text-gray-500 ml-1.5">{boat.boatModel.brand} {boat.boatModel.name}</span>
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

interface AvailableBoatOption {
  id: string;
  number: string;
  boatModelId: string | null;
  boatModelLabel: string | null;
  isLoaned: boolean;
}

interface RaceAssignmentsPanelProps {
  race: RaceData;
  teamId: string;
  raceDayId: string;
  canAssign: boolean;
  isHeadCoach: boolean;
  athletes: AthleteData[];
}

function RaceAssignmentsPanel({
  race,
  teamId,
  raceDayId,
  canAssign,
  isHeadCoach,
  athletes,
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

  const broughtQuery = useQuery<{ broughtBoats: RaceDayBoatData[] }, ApiError>({
    queryKey: ['broughtBoats', raceDayId],
    queryFn: () => getBroughtBoats(raceDayId),
    enabled: !!raceDayId,
  });

  const loansQuery = useQuery<{ loans: BoatLoanData[] }, ApiError>({
    queryKey: ['boatLoans', race.id],
    queryFn: () => listBoatLoans(race.id),
    enabled: !!race.id,
  });

  const assignMutation = useMutation({
    mutationFn: ({ entryId, boatId }: { entryId: string; boatId: string }) =>
      assignBoat(race.id, entryId, boatId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boatAssignments', race.id] });
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (entryId: string) => removeBoatAssignment(race.id, entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boatAssignments', race.id] });
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const autoAssignMutation = useMutation({
    mutationFn: () => autoAssignBoats(race.id, teamId, true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boatAssignments', race.id] });
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const lineup = lineupsQuery.data?.lineups.find((l) => l.teamId === teamId);

  if (!lineup) {
    return (
      <p className="text-sm text-gray-400 italic">No lineup submitted for this race.</p>
    );
  }

  const broughtBoats = (broughtQuery.data?.broughtBoats ?? []).filter(
    (rb) => rb.teamId === teamId
  );
  const loans = (loansQuery.data?.loans ?? []).filter((l) => l.toTeamId === teamId);

  const assignmentMap = new Map<string, BoatAssignmentData>(
    (assignmentsQuery.data?.assignments ?? []).map((a) => [a.entryId, a])
  );

  const availableBoatOptions: AvailableBoatOption[] = [
    ...broughtBoats.map((rb) => ({
      id: rb.boatId,
      number: rb.boat.number,
      boatModelId: rb.boat.boatModelId ?? null,
      boatModelLabel: rb.boat.boatModel ? `${rb.boat.boatModel.brand} ${rb.boat.boatModel.name}` : null,
      isLoaned: false,
    })),
    ...loans.map((l) => ({
      id: l.boatId,
      number: l.boat.number,
      boatModelId: l.boat.boatModelId ?? null,
      boatModelLabel: l.boat.boatModel ? `${l.boat.boatModel.brand} ${l.boat.boatModel.name}` : null,
      isLoaned: true,
    })),
  ];

  const athleteMap = new Map(athletes.map((a) => [a.id, a]));

  const entries = lineup.entries;
  const singleEntries = entries.filter((e) => !e.pairId);
  const doublesEntries = entries.filter((e) => e.pairId);

  const seenPairIds = new Set<string>();
  const uniqueDoublesPairs = doublesEntries.filter((e) => {
    if (!e.pairId || seenPairIds.has(e.pairId)) return false;
    seenPairIds.add(e.pairId);
    return true;
  });

  function boatOptionLabel(boat: AvailableBoatOption, athleteId: string): string {
    const athlete = athleteMap.get(athleteId);
    const baseLabel = `#${boat.number}${boat.boatModelLabel ? ` (${boat.boatModelLabel})` : ''}${boat.isLoaned ? ' [Loaned]' : ''}`;
    if (!athlete) return baseLabel;
    if (athlete.preferredBoatNumber && boat.number === athlete.preferredBoatNumber) {
      return `★ ${baseLabel}`;
    }
    if (athlete.preferredBoatModelId && boat.boatModelId === athlete.preferredBoatModelId) {
      return `* ${baseLabel}`;
    }
    return baseLabel;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">
          {race.classification?.label ?? 'Open'} &middot; {race.distance?.label}
        </h4>
        {isHeadCoach && singleEntries.length > 0 && !['setup', 'boat_prep'].includes(race.status) && (
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

      {/* Singles */}
      {singleEntries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Singles</p>
          {singleEntries.map((entry) => {
            const assignment = assignmentMap.get(entry.id);
            return (
              <div
                key={entry.id}
                className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
              >
                <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">
                  {entry.athlete.name}
                  {assignment && <ConflictLevelBadge level={assignment.conflictLevel} />}
                </span>
                {canAssign ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
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
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11 min-w-[160px]"
                    >
                      <option value="">Unassigned</option>
                      {availableBoatOptions.map((b) => (
                        <option key={b.id} value={b.id}>
                          {boatOptionLabel(b, entry.athleteId)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500 flex-shrink-0">
                    {assignment
                      ? `#${assignment.boat.number}`
                      : 'Unassigned'}
                  </span>
                )}
              </div>
            );
          })}
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

function RaceOutgoingLoans({
  race,
  teamId,
  races,
  isHeadCoach,
  onDelete,
}: {
  race: RaceData;
  teamId: string;
  races: RaceData[];
  isHeadCoach: boolean;
  onDelete: (raceId: string, loanId: string) => void;
}) {
  const loansQuery = useQuery<{ loans: BoatLoanData[] }, ApiError>({
    queryKey: ['boatLoans', race.id],
    queryFn: () => listBoatLoans(race.id),
  });
  const outgoing = (loansQuery.data?.loans ?? []).filter((l) => l.fromTeamId === teamId);
  if (outgoing.length === 0) return null;
  return (
    <>
      {outgoing.map((loan) => {
        const loanRace = races.find((r) => r.id === loan.raceId);
        return (
          <div key={loan.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <div className="text-sm">
              <span className="font-medium text-gray-800">
                #{loan.boat.number}{loan.boat.boatModel ? ` (${loan.boat.boatModel.brand} ${loan.boat.boatModel.name})` : ''}
              </span>
              <span className="text-gray-500 mx-1.5">to</span>
              <span className="text-gray-800">{loan.toTeam.name}</span>
              {loanRace && (
                <span className="text-gray-500 ml-1.5">
                  for {loanRace.classification?.label ?? 'Open'} {loanRace.distance?.label}
                </span>
              )}
            </div>
            {isHeadCoach && (
              <button
                type="button"
                onClick={() => onDelete(loan.raceId, loan.id)}
                className="text-xs text-red-500 hover:text-red-700 min-h-8 px-2"
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

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

  const broughtQuery = useQuery<{ broughtBoats: RaceDayBoatData[] }, ApiError>({
    queryKey: ['broughtBoats', raceDayId],
    queryFn: () => getBroughtBoats(raceDayId),
    enabled: !!raceDayId,
  });

  const teamsQuery = useQuery<{ teams: { id: string; name: string }[] }, ApiError>({
    queryKey: ['teamsInDivision', divisionId],
    queryFn: () =>
      apiFetch<{ teams: { id: string; name: string }[] }>(`/divisions/${divisionId}/teams`),
    enabled: isHeadCoach && !!divisionId,
  });

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

  const selectedRaceIndex = loanRaceId
    ? races.findIndex((r) => r.id === loanRaceId)
    : -1;
  const nextRace =
    selectedRaceIndex >= 0 && selectedRaceIndex < races.length - 1
      ? races[selectedRaceIndex + 1]
      : null;

  return (
    <div className="space-y-4">
      {races.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Current Outgoing Loans
          </p>
          {races.map((race) => (
            <RaceOutgoingLoans
              key={race.id}
              race={race}
              teamId={teamId}
              races={races}
              isHeadCoach={isHeadCoach}
              onDelete={(raceId, loanId) => deleteMutation.mutate({ raceId, loanId })}
            />
          ))}
        </div>
      )}

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
                    {rb.boat.boatModel ? ` (${rb.boat.boatModel.brand} ${rb.boat.boatModel.name})` : ''}
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
                    {r.classification?.label ?? 'Open'} &middot; {r.distance?.label}
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
                {nextRace.classification?.label ?? 'Open'} &middot; {nextRace.distance?.label}).
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

      {!isHeadCoach && (
        <p className="text-sm text-gray-400 italic">No outgoing loans.</p>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BoatPrepPage() {
  const { raceDayId } = useParams<{ raceDayId: string }>();
  const { memberships } = useAuthContext();

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

  const divisionId =
    coachMembership?.team
      ? memberships.find(
          (m) =>
            m.role === 'coordinator' ||
            (m.teamId === teamId && m.divisionId)
        )?.divisionId ?? ''
      : memberships.find((m) => m.divisionId)?.divisionId ?? '';

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

  const athletesQuery = useQuery<{ athletes: AthleteData[] }, ApiError>({
    queryKey: ['athletes', teamId],
    queryFn: () => listAthletes(teamId!),
    enabled: !!teamId,
  });

  const races = (racesQuery.data?.races ?? []).slice().sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
  const athletes = athletesQuery.data?.athletes ?? [];

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

        {/* Legend */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex flex-wrap gap-2 text-xs text-gray-500">
          <span className="font-medium">Boat conflict key:</span>
          <span className="bg-green-50 border border-green-200 text-green-700 rounded-full px-2 py-0.5">Available</span>
          <span className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-full px-2 py-0.5">2 heats away</span>
          <span className="bg-orange-50 border border-orange-200 text-orange-700 rounded-full px-2 py-0.5">1 heat away</span>
          <span className="bg-red-50 border border-red-200 text-red-700 rounded-full px-2 py-0.5">Unavailable</span>
          <span className="ml-2">★ = preferred number &nbsp; * = preferred model</span>
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
          ) : (
            <div className="space-y-5">
              {races.map((race) => (
                <RaceAssignmentsPanel
                  key={race.id}
                  race={race}
                  teamId={teamId}
                  raceDayId={raceDayId!}
                  canAssign={canManageBoatAssignments}
                  isHeadCoach={isHeadCoach}
                  athletes={athletes}
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
