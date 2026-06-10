import { apiFetch } from './client.js';
import type { BoatData } from './boats.js';

export interface RaceDayBoatData {
  raceDayId: string;
  boatId: string;
  teamId: string;
  boat: BoatData;
  team: { id: string; name: string };
}

export interface BroughtBoatsResponse {
  broughtBoats: RaceDayBoatData[];
}

export interface RaceDayBoatResponse {
  raceDayBoat: RaceDayBoatData;
}

export async function getBroughtBoats(raceDayId: string): Promise<BroughtBoatsResponse> {
  return apiFetch<BroughtBoatsResponse>(`/race-days/${raceDayId}/brought-boats`);
}

export async function markBoatBrought(
  raceDayId: string,
  boatId: string
): Promise<RaceDayBoatResponse> {
  return apiFetch<RaceDayBoatResponse>(`/race-days/${raceDayId}/brought-boats`, {
    method: 'POST',
    body: JSON.stringify({ boat_id: boatId }),
  });
}

export async function unmarkBoatBrought(
  raceDayId: string,
  boatId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/race-days/${raceDayId}/brought-boats/${boatId}`, {
    method: 'DELETE',
  });
}
