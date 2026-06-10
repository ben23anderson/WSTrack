import { apiFetch } from './client.js';

export interface DistanceData {
  id: string;
  label: string;
  sortOrder: number;
}

export interface BestTimeData {
  id: string;
  athleteId: string;
  distanceId: string;
  timeMs: number;
  isOfficial: boolean;
  recordedAt: string;
  distance: DistanceData;
}

export interface AthleteData {
  id: string;
  teamId: string;
  name: string;
  grade: string | null;
  photoUrl: string | null;
  createdAt: string;
  deletedAt: string | null;
  bestTimes: BestTimeData[];
}

export interface AthletesResponse {
  athletes: AthleteData[];
}

export interface AthleteResponse {
  athlete: AthleteData;
}

export interface BestTimeResponse {
  bestTime: BestTimeData;
}

export async function listAthletes(teamId: string): Promise<AthletesResponse> {
  return apiFetch<AthletesResponse>(`/teams/${teamId}/athletes`);
}

export async function createAthlete(
  teamId: string,
  data: { name: string; grade?: string }
): Promise<AthleteResponse> {
  return apiFetch<AthleteResponse>(`/teams/${teamId}/athletes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAthlete(
  teamId: string,
  athleteId: string,
  data: { name?: string; grade?: string }
): Promise<AthleteResponse> {
  return apiFetch<AthleteResponse>(`/teams/${teamId}/athletes/${athleteId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteAthlete(
  teamId: string,
  athleteId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/teams/${teamId}/athletes/${athleteId}`, {
    method: 'DELETE',
  });
}

export async function uploadAthletePhoto(
  teamId: string,
  athleteId: string,
  file: File
): Promise<AthleteResponse> {
  const formData = new FormData();
  formData.append('photo', file);
  const res = await fetch(`/api/teams/${teamId}/athletes/${athleteId}/photo`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return res.json() as Promise<AthleteResponse>;
}

export async function upsertBestTime(
  teamId: string,
  athleteId: string,
  distanceId: string,
  data: { time_ms: number; is_official: boolean }
): Promise<BestTimeResponse> {
  return apiFetch<BestTimeResponse>(
    `/teams/${teamId}/athletes/${athleteId}/best-times/${distanceId}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
}

export async function deleteBestTime(
  teamId: string,
  athleteId: string,
  distanceId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/teams/${teamId}/athletes/${athleteId}/best-times/${distanceId}`,
    { method: 'DELETE' }
  );
}
