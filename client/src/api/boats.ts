import { apiFetch } from './client.js';

export interface BoatData {
  id: string;
  teamId: string;
  number: string;
  model: string | null;
  isDouble: boolean;
  modelRank: number;
  numberRank: number;
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
    model?: string;
    is_double?: boolean;
    model_rank?: number;
    number_rank?: number;
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
    model?: string;
    is_double?: boolean;
    model_rank?: number;
    number_rank?: number;
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
