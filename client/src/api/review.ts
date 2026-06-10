import { apiFetch } from './client.js';

export interface ReconciliationEntry {
  entryId: string;
  timeMs: number;
  place: number;
  status: 'ok' | 'review_needed';
  conflict_reason?: string;
}

export interface ResultData {
  id: string;
  entryId: string;
  heatId: string | null;
  finalId: string | null;
  place: number | null;
  timeMs: number | null;
  status: string;
  isFinal: boolean;
  entry: {
    athlete: { id: string; name: string; grade?: string | null };
    lineup: { team: { id: string; name: string } };
  };
}

export function getHeatResults(heatId: string) {
  return apiFetch<{ results: ResultData[] }>(`/heats/${heatId}/results`);
}

export function reconcileHeat(heatId: string, save: boolean) {
  return apiFetch<{ entries: ReconciliationEntry[]; all_agreed: boolean }>(
    `/heats/${heatId}/reconcile`,
    { method: 'POST', body: JSON.stringify({ save }) }
  );
}

export function adjustResult(
  heatId: string,
  resultId: string,
  data: { place?: number; time_ms?: number; status?: string }
) {
  return apiFetch<{ result: ResultData }>(`/heats/${heatId}/results/${resultId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function finalizeHeat(heatId: string) {
  return apiFetch<{ ok: boolean }>(`/heats/${heatId}/finalize`, { method: 'POST' });
}
