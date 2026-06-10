import { apiFetch } from './client.js';

export interface BoatLoanData {
  id: string;
  boatId: string;
  fromTeamId: string;
  toTeamId: string;
  raceId: string;
  createdAt: string;
  boat: { id: string; number: string; model: string | null };
  fromTeam: { id: string; name: string };
  toTeam: { id: string; name: string };
}

export interface BoatLoansResponse {
  loans: BoatLoanData[];
}

export interface BoatLoanResponse {
  loan: BoatLoanData;
}

export async function listBoatLoans(raceId: string): Promise<BoatLoansResponse> {
  return apiFetch<BoatLoansResponse>(`/races/${raceId}/boat-loans`);
}

export async function createBoatLoan(
  raceId: string,
  data: { boat_id: string; to_team_id: string }
): Promise<BoatLoanResponse> {
  return apiFetch<BoatLoanResponse>(`/races/${raceId}/boat-loans`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteBoatLoan(
  raceId: string,
  loanId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/races/${raceId}/boat-loans/${loanId}`, {
    method: 'DELETE',
  });
}
