import { apiFetch } from './client.js';

export interface BoatModelData {
  id: string;
  brand: string;
  name: string;
  divisionId: string;
}

export function listBoatModels(divisionId: string): Promise<{ models: BoatModelData[] }> {
  return apiFetch(`/api/divisions/${divisionId}/boat-models`);
}

export function createBoatModel(divisionId: string, data: { brand: string; name: string }): Promise<{ model: BoatModelData }> {
  return apiFetch(`/api/divisions/${divisionId}/boat-models`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteBoatModel(divisionId: string, modelId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/divisions/${divisionId}/boat-models/${modelId}`, { method: 'DELETE' });
}
