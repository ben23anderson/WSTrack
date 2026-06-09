import { apiFetch } from './client.js';

export interface AcceptInviteResponse {
  membership: {
    id: string;
    role: string;
    teamId: string | null;
    divisionId: string | null;
  };
  teamId: string | null;
}

export async function acceptInvite(token: string): Promise<AcceptInviteResponse> {
  return apiFetch<AcceptInviteResponse>(`/invites/${token}/accept`, {
    method: 'POST',
  });
}
