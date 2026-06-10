import { apiFetch } from './client.js';

export interface DistanceData {
  id: string;
  divisionId: string;
  label: string;
  sortOrder: number;
  createdAt: string;
}

export interface ClassificationData {
  id: string;
  divisionId: string;
  label: string;
  isDoubles: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface DistancesResponse {
  distances: DistanceData[];
}

export interface DistanceResponse {
  distance: DistanceData;
}

export interface ClassificationsResponse {
  classifications: ClassificationData[];
}

export interface ClassificationResponse {
  classification: ClassificationData;
}

export async function listDistances(divisionId: string): Promise<DistancesResponse> {
  return apiFetch<DistancesResponse>(`/divisions/${divisionId}/distances`);
}

export async function createDistance(
  divisionId: string,
  data: { label: string; sort_order?: number }
): Promise<DistanceResponse> {
  return apiFetch<DistanceResponse>(`/divisions/${divisionId}/distances`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteDistance(
  divisionId: string,
  distanceId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/divisions/${divisionId}/distances/${distanceId}`, {
    method: 'DELETE',
  });
}

export async function listClassifications(divisionId: string): Promise<ClassificationsResponse> {
  return apiFetch<ClassificationsResponse>(`/divisions/${divisionId}/classifications`);
}

export async function createClassification(
  divisionId: string,
  data: { label: string; is_doubles?: boolean; sort_order?: number }
): Promise<ClassificationResponse> {
  return apiFetch<ClassificationResponse>(`/divisions/${divisionId}/classifications`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteClassification(
  divisionId: string,
  classificationId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/divisions/${divisionId}/classifications/${classificationId}`, {
    method: 'DELETE',
  });
}
