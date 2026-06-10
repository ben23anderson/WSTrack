import { apiFetch } from './client.js';

export interface UserData {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface MembershipData {
  id: string;
  role: string;
  teamId: string | null;
  divisionId: string | null;
  permissions: Record<string, boolean> | null;
  team: { id: string; name: string } | null;
  division: { id: string; name: string } | null;
}

export interface MeResponse {
  user: UserData;
  memberships: MembershipData[];
}

export interface AuthResponse {
  user: UserData;
}

export async function signup(data: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function login(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/auth/me');
}
