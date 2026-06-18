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
  team: { id: string; name: string; divisionId: string } | null;
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
  invite_token?: string;
}): Promise<AuthResponse & { requiresVerification?: boolean; teamId?: string | null }> {
  return apiFetch<AuthResponse & { requiresVerification?: boolean; teamId?: string | null }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function verifyEmail(token: string): Promise<{ ok: boolean; user: UserData }> {
  return apiFetch<{ ok: boolean; user: UserData }>(`/auth/verify-email/${token}`);
}

export async function resendVerification(email: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(email: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
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
