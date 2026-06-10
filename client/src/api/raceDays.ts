import { apiFetch } from './client.js';

export interface OfficialSummary {
  id: string;
  name: string;
}

export interface RaceDayOfficial {
  raceDayId: string;
  userId: string;
  user: OfficialSummary;
}

export interface RaceSummary {
  id: string;
  raceDayId: string;
  classificationId: string;
  distanceId: string;
  laneCount: number;
  orderIndex: number;
  hasFinals: boolean;
  finalBEnabled: boolean;
  status: string;
  classification: { id: string; label: string };
  distance: { id: string; label: string };
}

export interface RaceDayData {
  id: string;
  divisionId: string;
  name: string;
  date: string;
  primaryOfficialId: string | null;
  createdAt: string;
  primaryOfficial: OfficialSummary | null;
  officials?: RaceDayOfficial[];
  races?: RaceSummary[];
  _count?: { races: number };
}

export interface RaceDaysResponse {
  raceDays: RaceDayData[];
}

export interface RaceDayResponse {
  raceDay: RaceDayData;
}

export async function listRaceDays(divisionId: string): Promise<RaceDaysResponse> {
  return apiFetch<RaceDaysResponse>(`/divisions/${divisionId}/race-days`);
}

export async function createRaceDay(
  divisionId: string,
  data: {
    name: string;
    date: string;
    primary_official_id?: string;
    official_ids?: string[];
  }
): Promise<RaceDayResponse> {
  return apiFetch<RaceDayResponse>(`/divisions/${divisionId}/race-days`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getRaceDay(divisionId: string, raceDayId: string): Promise<RaceDayResponse> {
  return apiFetch<RaceDayResponse>(`/divisions/${divisionId}/race-days/${raceDayId}`);
}

export async function updateRaceDay(
  divisionId: string,
  raceDayId: string,
  data: {
    name?: string;
    date?: string;
    primary_official_id?: string | null;
    official_ids?: string[];
  }
): Promise<RaceDayResponse> {
  return apiFetch<RaceDayResponse>(`/divisions/${divisionId}/race-days/${raceDayId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
