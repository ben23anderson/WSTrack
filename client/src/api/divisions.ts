import { apiFetch } from './client.js';

export interface DivisionData {
  id: string;
  name: string;
  leagueId: string;
  createdAt: string;
  league: { id: string; name: string };
  teams: TeamSummary[];
}

export interface TeamSummary {
  id: string;
  name: string;
  createdAt: string;
}

export interface DivisionResponse {
  division: DivisionData;
}

export interface TeamsResponse {
  teams: TeamSummary[];
}

export interface CreateDivisionResponse {
  division: { id: string; name: string; leagueId: string; createdAt: string };
}

export interface CreateTeamResponse {
  team: { id: string; name: string; divisionId: string; createdAt: string };
}

export async function createDivision(data: {
  name: string;
  leagueId: string;
}): Promise<CreateDivisionResponse> {
  return apiFetch<CreateDivisionResponse>('/divisions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getDivision(divisionId: string): Promise<DivisionResponse> {
  return apiFetch<DivisionResponse>(`/divisions/${divisionId}`);
}

export async function createTeam(
  divisionId: string,
  data: { name: string }
): Promise<CreateTeamResponse> {
  return apiFetch<CreateTeamResponse>(`/divisions/${divisionId}/teams`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getTeams(divisionId: string): Promise<TeamsResponse> {
  return apiFetch<TeamsResponse>(`/divisions/${divisionId}/teams`);
}
