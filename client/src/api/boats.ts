import { apiFetch } from './client.js';

export interface BoatData {
  id: string;
  teamId: string;
  number: string;
  boatModelId: string | null;
  boatModel: { id: string; brand: string; name: string } | null;
  isDouble: boolean;
  createdAt: string;
  deletedAt: string | null;
}

export interface BoatsResponse {
  boats: BoatData[];
}

export interface BoatResponse {
  boat: BoatData;
}

export async function listBoats(teamId: string): Promise<BoatsResponse> {
  return apiFetch<BoatsResponse>(`/teams/${teamId}/boats`);
}

export async function createBoat(
  teamId: string,
  data: {
    number: string;
    boat_model_id?: string;
    is_double?: boolean;
  }
): Promise<BoatResponse> {
  return apiFetch<BoatResponse>(`/teams/${teamId}/boats`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBoat(
  teamId: string,
  boatId: string,
  data: {
    number?: string;
    boat_model_id?: string;
    is_double?: boolean;
  }
): Promise<BoatResponse> {
  return apiFetch<BoatResponse>(`/teams/${teamId}/boats/${boatId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteBoat(
  teamId: string,
  boatId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/teams/${teamId}/boats/${boatId}`, {
    method: 'DELETE',
  });
}

export async function bulkCreateBoats(
  teamId: string,
  boats: { number: string; boat_model_id?: string; is_double?: boolean }[]
): Promise<{ boats: BoatData[]; count: number }> {
  return apiFetch<{ boats: BoatData[]; count: number }>(`/teams/${teamId}/boats/bulk`, {
    method: 'POST',
    body: JSON.stringify({ boats }),
  });
}
