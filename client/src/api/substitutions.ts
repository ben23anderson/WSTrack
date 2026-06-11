import { apiFetch } from './client.js';

export interface SubstitutionData {
  id: string;
  raceId: string;
  teamId: string;
  outAthleteId: string;
  inAthleteId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  proposedBoatId?: string | null;
  proposedBoat?: { id: string; number: string } | null;
  team: { id: string; name: string };
  outAthlete: { id: string; name: string };
  inAthlete: { id: string; name: string };
}

export interface SubstitutionsResponse {
  substitutions: SubstitutionData[];
}

export interface SubstitutionResponse {
  substitution: SubstitutionData;
}

export async function listSubstitutions(raceId: string): Promise<SubstitutionsResponse> {
  return apiFetch<SubstitutionsResponse>(`/races/${raceId}/substitutions`);
}

export async function requestSubstitution(
  raceId: string,
  data: { out_athlete_id: string; in_athlete_id: string }
): Promise<SubstitutionResponse> {
  return apiFetch<SubstitutionResponse>(`/races/${raceId}/substitutions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function reviewSubstitution(
  raceId: string,
  substitutionId: string,
  data: { status: 'approved' | 'rejected' }
): Promise<SubstitutionResponse> {
  return apiFetch<SubstitutionResponse>(`/races/${raceId}/substitutions/${substitutionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function updateSubstitutionBoat(
  raceId: string,
  substitutionId: string,
  proposedBoatId: string | null
): Promise<SubstitutionResponse> {
  return apiFetch<SubstitutionResponse>(`/races/${raceId}/substitutions/${substitutionId}/boat`, {
    method: 'PATCH',
    body: JSON.stringify({ proposed_boat_id: proposedBoatId }),
  });
}
