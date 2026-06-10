import { apiFetch } from './client.js';

export interface TeamData {
  id: string;
  name: string;
  divisionId: string;
  createdAt: string;
  division: { id: string; name: string; leagueId: string };
}

export interface MemberData {
  id: string;
  role: string;
  permissions: Record<string, boolean> | null;
  user: { id: string; name: string; email: string };
}

export interface AssistantPermissions {
  roster: boolean;
  boat_inventory: boolean;
  boat_assignments: boolean;
}

export interface InviteData {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export interface TeamResponse {
  team: TeamData;
}

export interface MembersResponse {
  members: MemberData[];
}

export interface InviteResponse {
  invite: InviteData;
}

export interface MembershipResponse {
  membership: MemberData;
}

export async function getTeam(teamId: string): Promise<TeamResponse> {
  return apiFetch<TeamResponse>(`/teams/${teamId}`);
}

export async function updateTeam(
  teamId: string,
  data: { name: string }
): Promise<TeamResponse> {
  return apiFetch<TeamResponse>(`/teams/${teamId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function inviteUser(
  teamId: string,
  data: {
    email: string;
    role: string;
    permissions?: AssistantPermissions;
  }
): Promise<InviteResponse> {
  return apiFetch<InviteResponse>(`/teams/${teamId}/invite`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getMembers(teamId: string): Promise<MembersResponse> {
  return apiFetch<MembersResponse>(`/teams/${teamId}/members`);
}

export async function updateMember(
  teamId: string,
  membershipId: string,
  data: { permissions: AssistantPermissions }
): Promise<MembershipResponse> {
  return apiFetch<MembershipResponse>(`/teams/${teamId}/members/${membershipId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function removeMember(
  teamId: string,
  membershipId: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/teams/${teamId}/members/${membershipId}`, {
    method: 'DELETE',
  });
}
