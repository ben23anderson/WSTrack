import { apiFetch } from './client.js';

export async function createLeague(data: { leagueName: string; divisionName: string }) {
  return apiFetch<{ league: { id: string; name: string }; division: { id: string; name: string } }>('/leagues', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
