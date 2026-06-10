import { apiFetch } from './client.js';

export interface LaneAssignmentData {
  id: string;
  lane: number;
  entry: {
    id: string;
    athleteId: string;
    pairId: string | null;
    athlete: { id: string; name: string; grade: string | null };
    lineup: { team: { id: string; name: string } };
  };
}

export interface HeatData {
  id: string;
  raceId: string;
  heatNumber: number;
  startTs: string | null;
  createdAt: string;
  laneAssignments: LaneAssignmentData[];
}

export interface HeatsResponse {
  heats: HeatData[];
}

export async function seedRace(
  raceId: string,
  options: { strategy: string; balance_teams: boolean }
): Promise<HeatsResponse> {
  return apiFetch<HeatsResponse>(`/races/${raceId}/seed`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function getHeats(raceId: string): Promise<HeatsResponse> {
  return apiFetch<HeatsResponse>(`/races/${raceId}/heats`);
}

export async function deleteHeats(raceId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/races/${raceId}/heats`, { method: 'DELETE' });
}
