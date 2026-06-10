import { apiFetch } from './client.js';

export interface LaneAssignmentData {
  id: string;
  lane: number;
  entryId: string;
  entry: {
    athlete: { id: string; name: string; grade?: string | null };
    lineup: { team: { id: string; name: string } };
  };
}

export interface FinalResultData {
  id: string;
  entryId: string;
  finalId: string;
  place: number | null;
  timeMs: number | null;
  status: string;
  isFinal: boolean;
  entry: {
    athlete: { id: string; name: string; grade?: string | null };
    lineup: { team: { id: string; name: string } };
  };
}

export interface FinalData {
  id: string;
  raceId: string;
  type: string;
  startTs: string | null;
  laneAssignments: LaneAssignmentData[];
  results?: FinalResultData[];
}

export interface ReconciliationEntry {
  entryId: string;
  timeMs: number;
  place: number;
  status: 'ok' | 'review_needed';
  conflict_reason?: string;
}

export function listFinals(raceId: string) {
  return apiFetch<{ finals: FinalData[] }>(`/races/${raceId}/finals`);
}

export function getFinal(raceId: string, finalId: string) {
  return apiFetch<{ final: FinalData }>(`/races/${raceId}/finals/${finalId}`);
}

export function generateFinals(raceId: string) {
  return apiFetch<{ finals: FinalData[] }>(`/races/${raceId}/generate-finals`, {
    method: 'POST',
  });
}

export function publishFinal(finalId: string) {
  return apiFetch<{ results: FinalResultData[] }>(`/finals/${finalId}/publish`, {
    method: 'POST',
  });
}

export function getFinalResults(finalId: string) {
  return apiFetch<{ results: FinalResultData[] }>(`/finals/${finalId}/results`);
}

export function reconcileFinal(finalId: string, save: boolean) {
  return apiFetch<{ entries: ReconciliationEntry[]; all_agreed: boolean }>(
    `/finals/${finalId}/reconcile`,
    { method: 'POST', body: JSON.stringify({ save }) }
  );
}

export function adjustFinalResult(
  finalId: string,
  resultId: string,
  data: { place?: number; time_ms?: number; status?: string }
) {
  return apiFetch<{ result: FinalResultData }>(`/finals/${finalId}/results/${resultId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function finalizeFinal(finalId: string) {
  return apiFetch<{ ok: boolean }>(`/finals/${finalId}/finalize`, { method: 'POST' });
}
