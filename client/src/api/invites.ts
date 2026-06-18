import { apiFetch } from './client.js';

export interface InviteInfo {
  email: string;
  role: string;
  teamName: string | null;
  divisionName: string | null;
  isExpired: boolean;
  isAccepted: boolean;
  emailHasAccount: boolean;
}

export async function getInviteInfo(token: string): Promise<{ invite: InviteInfo }> {
  return apiFetch<{ invite: InviteInfo }>(`/invites/${token}`);
}

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
