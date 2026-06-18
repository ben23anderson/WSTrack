import { apiFetch } from './client.js';

export interface LeagueSummary {
  id: string;
  name: string;
  divisions: { id: string; name: string }[];
}

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

export function listAdminLeagues(): Promise<{ leagues: LeagueSummary[] }> {
  return apiFetch('/admin/leagues');
}

export function createAdminLeague(data: { leagueName: string; divisionName: string }): Promise<{ league: { id: string; name: string }; division: { id: string; name: string } }> {
  return apiFetch('/admin/leagues', { method: 'POST', body: JSON.stringify(data) });
}

export function searchUserByEmail(email: string): Promise<{ user: UserSearchResult | null }> {
  return apiFetch(`/admin/users?email=${encodeURIComponent(email)}`);
}

export function assignCoordinator(divisionId: string, userId: string): Promise<{ membership: { id: string } }> {
  return apiFetch(`/admin/divisions/${divisionId}/coordinators`, { method: 'POST', body: JSON.stringify({ userId }) });
}
