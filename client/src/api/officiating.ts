import { apiFetch } from './client.js';

export function startHeat(heatId: string) {
  return apiFetch<{ heat: unknown }>(`/heats/${heatId}/start`, { method: 'POST' });
}

export function getOrCreateTape(heatId: string) {
  return apiFetch<{ tape: unknown }>(`/heats/${heatId}/tapes`, { method: 'POST' });
}

export function getTapes(heatId: string) {
  return apiFetch<{ tapes: unknown[] }>(`/heats/${heatId}/tapes`);
}

export function recordFinish(
  heatId: string,
  data: { entry_id?: string; boat_number?: string; client_finish_ts: number; sequence: number }
) {
  return apiFetch<{ event: { id: string; boatNumber: string | null; clientFinishTs: number; sequence: number } }>(`/heats/${heatId}/finish-events`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteFinish(heatId: string, eventId: string) {
  return apiFetch<{ ok: boolean }>(`/heats/${heatId}/finish-events/${eventId}`, {
    method: 'DELETE',
  });
}

export function markDnsDq(heatId: string, data: { entry_id: string; status: 'dns' | 'dq' }) {
  return apiFetch<{ result: unknown }>(`/heats/${heatId}/dns-dq`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function logDisagree(
  heatId: string,
  data: { finish_event_id: string; reason?: string }
) {
  return apiFetch<{ event: unknown }>(`/heats/${heatId}/disagree`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getReconciliation(heatId: string) {
  return apiFetch<{
    reconciled: boolean;
    entries?: unknown[];
    all_agreed?: boolean;
  }>(`/heats/${heatId}/reconciliation`);
}

export function submitManualResults(
  heatId: string,
  data: {
    results: Array<{
      entry_id: string;
      place: number;
      time_ms?: number;
      status?: string;
    }>;
  }
) {
  return apiFetch<{ results: unknown[] }>(`/heats/${heatId}/manual-results`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
