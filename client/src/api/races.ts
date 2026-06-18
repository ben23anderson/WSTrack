import { apiFetch } from './client.js';

export interface RaceData {
  id: string;
  raceDayId: string;
  classificationId: string | null;
  distanceId: string;
  laneCount: number;
  orderIndex: number;
  hasFinals: boolean;
  finalBEnabled: boolean;
  advancementRule: Record<string, unknown> | null;
  finalBRule: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  classification: { id: string; label: string; isDoubles: boolean } | null;
  distance: { id: string; label: string };
}

export interface RacesResponse {
  races: RaceData[];
}

export interface RaceResponse {
  race: RaceData;
}

export async function listRaces(raceDayId: string): Promise<RacesResponse> {
  return apiFetch<RacesResponse>(`/race-days/${raceDayId}/races`);
}

export async function createRace(
  raceDayId: string,
  data: {
    classification_id?: string;
    distance_id: string;
    lane_count?: number;
    order_index: number;
    has_finals?: boolean;
    final_b_enabled?: boolean;
    advancement_rule?: Record<string, unknown>;
    final_b_rule?: Record<string, unknown>;
  }
): Promise<RaceResponse> {
  return apiFetch<RaceResponse>(`/race-days/${raceDayId}/races`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getRace(raceDayId: string, raceId: string): Promise<RaceResponse> {
  return apiFetch<RaceResponse>(`/race-days/${raceDayId}/races/${raceId}`);
}

export async function updateRace(
  raceDayId: string,
  raceId: string,
  data: Partial<{
    classification_id: string;
    distance_id: string;
    lane_count: number;
    order_index: number;
    has_finals: boolean;
    final_b_enabled: boolean;
    advancement_rule: Record<string, unknown>;
    final_b_rule: Record<string, unknown>;
    status: string;
  }>
): Promise<RaceResponse> {
  return apiFetch<RaceResponse>(`/race-days/${raceDayId}/races/${raceId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteRace(raceDayId: string, raceId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/race-days/${raceDayId}/races/${raceId}`, {
    method: 'DELETE',
  });
}

export async function getRaceInfo(raceId: string): Promise<RaceResponse> {
  return apiFetch<RaceResponse>(`/races/${raceId}`);
}
