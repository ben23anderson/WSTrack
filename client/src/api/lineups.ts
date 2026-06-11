import { apiFetch } from './client.js';

export interface AthleteSummary {
  id: string;
  name: string;
  grade?: string | null;
}

export interface LineupEntry {
  id: string;
  lineupId: string;
  athleteId: string;
  pairId: string | null;
  athlete: AthleteSummary;
}

export interface LineupData {
  id: string;
  teamId: string;
  raceId: string;
  submitted: boolean;
  createdAt: string;
  team: { id: string; name: string };
  entries: LineupEntry[];
}

export interface RaceInfo {
  distanceId: string;
  distance: { id: string; label: string };
}

export interface LineupsResponse {
  lineups: LineupData[];
  race: RaceInfo | null;
}

export interface LineupResponse {
  lineup: LineupData;
}

export interface EntriesResponse {
  entries: LineupEntry[];
}

export interface EntryResponse {
  entry: LineupEntry;
}

export async function getLineups(raceId: string): Promise<LineupsResponse> {
  return apiFetch<LineupsResponse>(`/races/${raceId}/lineups`);
}

export async function getOrCreateLineup(raceId: string): Promise<LineupResponse> {
  return apiFetch<LineupResponse>(`/races/${raceId}/lineups`, {
    method: 'POST',
  });
}

export async function submitLineup(raceId: string, teamId: string): Promise<LineupResponse> {
  return apiFetch<LineupResponse>(`/races/${raceId}/lineups/${teamId}/submit`, {
    method: 'POST',
  });
}

export async function unsubmitLineup(raceId: string, teamId: string): Promise<LineupResponse> {
  return apiFetch<LineupResponse>(`/races/${raceId}/lineups/${teamId}/unsubmit`, {
    method: 'POST',
  });
}

export async function getLineupEntries(raceId: string, teamId: string): Promise<EntriesResponse> {
  return apiFetch<EntriesResponse>(`/races/${raceId}/lineups/${teamId}/entries`);
}

export async function addLineupEntry(
  raceId: string,
  teamId: string,
  data: { athlete_id: string; pair_id?: string }
): Promise<EntryResponse> {
  return apiFetch<EntryResponse>(`/races/${raceId}/lineups/${teamId}/entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface LineupStatus {
  raceId: string;
  exists: boolean;
  submitted: boolean;
}

export async function getLineupStatus(raceDayId: string): Promise<{ statuses: LineupStatus[] }> {
  return apiFetch(`/race-days/${raceDayId}/races/lineup-status`);
}

export async function bulkAddLineupEntries(
  raceId: string,
  teamId: string,
  data: { athlete_ids: string[] }
): Promise<{ entries: LineupEntry[]; errors: { athleteId: string; message: string }[] }> {
  return apiFetch(`/races/${raceId}/lineups/${teamId}/entries/bulk`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function removeLineupEntry(
  raceId: string,
  teamId: string,
  entryId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/races/${raceId}/lineups/${teamId}/entries/${entryId}`, {
    method: 'DELETE',
  });
}
