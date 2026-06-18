import { apiFetch } from './client.js';

export interface HeatResultEntry {
  place: number | null;
  timeMs: number | null;
  status: string;
  athlete: { id: string; name: string; grade?: string | null };
  team: { id: string; name: string };
  boatNumber: string | null;
}

export interface HeatResultGroup {
  heatNumber: number;
  entries: HeatResultEntry[];
}

export interface StandingEntry {
  place: number | null;
  entryId: string;
  athleteName: string;
  teamName: string;
  boatNumber: string | null;
  timeMs: number | null;
  status: string;
  source: 'final' | 'heat';
}

export function publishRace(raceId: string) {
  return apiFetch<{ race: unknown; results: unknown[] }>(`/races/${raceId}/publish`, {
    method: 'POST',
  });
}

export function getRaceResults(raceId: string) {
  return apiFetch<{ heats: HeatResultGroup[] }>(`/races/${raceId}/results`);
}

export function getRaceStandings(raceId: string) {
  return apiFetch<{ standings: StandingEntry[] }>(`/races/${raceId}/standings`);
}
