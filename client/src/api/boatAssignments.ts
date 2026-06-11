import { apiFetch } from './client.js';

export type ConflictLevel = 'none' | '2_heats' | '1_heat';

export interface BoatAssignmentData {
  id: string;
  raceId: string;
  entryId: string;
  boatId: string;
  isFinalAssignment: boolean;
  conflictLevel: ConflictLevel;
  boat: { id: string; number: string; model: string | null };
  entry: {
    id: string;
    lineupId: string;
    athleteId: string;
    pairId: string | null;
    teamId: string;
    athlete: { id: string; name: string };
  };
}

export interface BoatAssignmentsResponse {
  assignments: BoatAssignmentData[];
}

export interface BoatAssignmentResponse {
  assignment: BoatAssignmentData;
}

export interface AutoAssignResult {
  entryId: string;
  boatId: string;
  conflictLevel: ConflictLevel;
}

export interface AutoAssignResponse {
  assignments: AutoAssignResult[];
  saved: boolean;
}

export interface AvailableBoatData {
  id: string;
  number: string;
  model: string | null;
  modelRank: number;
  numberRank: number;
  isLoaned: boolean;
  conflictLevel: ConflictLevel;
}

export async function listBoatAssignments(raceId: string): Promise<BoatAssignmentsResponse> {
  return apiFetch<BoatAssignmentsResponse>(`/races/${raceId}/boat-assignments`);
}

export async function getAvailableBoatsForRace(
  raceId: string,
  teamId: string
): Promise<{ boats: AvailableBoatData[] }> {
  return apiFetch<{ boats: AvailableBoatData[] }>(
    `/races/${raceId}/boat-assignments/available-boats?team_id=${encodeURIComponent(teamId)}`
  );
}

export async function assignBoat(
  raceId: string,
  entryId: string,
  boatId: string
): Promise<BoatAssignmentResponse> {
  return apiFetch<BoatAssignmentResponse>(`/races/${raceId}/boat-assignments/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify({ boat_id: boatId }),
  });
}

export async function removeBoatAssignment(
  raceId: string,
  entryId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/races/${raceId}/boat-assignments/${entryId}`, {
    method: 'DELETE',
  });
}

export async function autoAssignBoats(
  raceId: string,
  teamId: string,
  save: boolean
): Promise<AutoAssignResponse> {
  return apiFetch<AutoAssignResponse>(`/races/${raceId}/boat-assignments/auto-assign`, {
    method: 'POST',
    body: JSON.stringify({ team_id: teamId, save }),
  });
}
