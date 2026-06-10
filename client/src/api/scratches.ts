import { apiFetch } from './client.js';

export interface ScratchData {
  id: string;
  raceId: string;
  teamId: string;
  athleteId: string;
  createdAt: string;
  team: { id: string; name: string };
  athlete: { id: string; name: string };
}

export interface ScratchesResponse {
  scratches: ScratchData[];
}

export interface ScratchResponse {
  scratch: ScratchData;
}

export async function listScratches(raceId: string): Promise<ScratchesResponse> {
  return apiFetch<ScratchesResponse>(`/races/${raceId}/scratches`);
}

export async function scratchAthlete(
  raceId: string,
  data: { athlete_id: string }
): Promise<ScratchResponse> {
  return apiFetch<ScratchResponse>(`/races/${raceId}/scratches`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function unScratch(raceId: string, scratchId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/races/${raceId}/scratches/${scratchId}`, {
    method: 'DELETE',
  });
}
