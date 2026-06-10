import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import {
  getHeatResults,
  reconcileHeat,
  adjustResult,
  finalizeHeat,
} from '../api/review.js';
import type { ResultData, ReconciliationEntry } from '../api/review.js';

function formatTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

function parseMmSs(str: string): number | null {
  const m = str.match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  const secs = parseFloat(m[2]);
  return Math.round((mins * 60 + secs) * 1000);
}

interface ResultRowProps {
  result: ResultData;
  heatId: string;
  isPrimary: boolean;
  onSaved: () => void;
}

function ResultRow({ result, heatId, isPrimary, onSaved }: ResultRowProps) {
  const [place, setPlace] = useState(result.place?.toString() ?? '');
  const [timeStr, setTimeStr] = useState(formatTime(result.timeMs) === '—' ? '' : formatTime(result.timeMs));
  const [status, setStatus] = useState(result.status);
  const [rowError, setRowError] = useState('');
  const [saved, setSaved] = useState(false);

  const adjustMutation = useMutation({
    mutationFn: () => {
      const data: { place?: number; time_ms?: number; status?: string } = {};
      const parsedPlace = parseInt(place, 10);
      if (!isNaN(parsedPlace) && parsedPlace > 0) data.place = parsedPlace;
      if (timeStr) {
        const ms = parseMmSs(timeStr);
        if (ms === null) { setRowError('Invalid time format (use M:SS.ss)'); return Promise.reject(new Error('Invalid time')); }
        data.time_ms = ms;
      }
      data.status = status;
      return adjustResult(heatId, result.id, data);
    },
    onSuccess: () => {
      setRowError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    },
    onError: (err: ApiError) => setRowError(err.message),
  });

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-3 py-2 text-sm text-gray-700">
        {result.entry.athlete.name}
        <div className="text-xs text-gray-400">{result.entry.lineup.team.name}</div>
      </td>
      <td className="px-3 py-2">
        {isPrimary ? (
          <input
            type="number"
            min={1}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-8"
            placeholder="—"
          />
        ) : (
          <span className="text-sm">{result.place ?? '—'}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {isPrimary ? (
          <input
            type="text"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-8"
            placeholder="0:00.00"
          />
        ) : (
          <span className="text-sm font-mono">{formatTime(result.timeMs)}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {isPrimary ? (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-8"
          >
            <option value="ok">OK</option>
            <option value="dns">DNS</option>
            <option value="dnf">DNF</option>
            <option value="dq">DQ</option>
          </select>
        ) : (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            status === 'ok' ? 'bg-green-100 text-green-700' :
            status === 'dns' ? 'bg-gray-100 text-gray-600' :
            'bg-red-100 text-red-700'
          }`}>{status.toUpperCase()}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {rowError && <p className="text-xs text-red-500 mb-1">{rowError}</p>}
        {isPrimary && (
          <button
            onClick={() => adjustMutation.mutate()}
            disabled={adjustMutation.isPending}
            className={`text-xs font-medium rounded-lg px-3 py-1.5 min-h-8 transition-colors ${
              saved
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60'
            }`}
          >
            {adjustMutation.isPending ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        )}
      </td>
    </tr>
  );
}

export default function ReviewPage() {
  const { heatId } = useParams<{ heatId: string }>();
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();
  const [reconcilePreview, setReconcilePreview] = useState<ReconciliationEntry[] | null>(null);
  const [reconcileAllAgreed, setReconcileAllAgreed] = useState<boolean | null>(null);
  const [actionError, setActionError] = useState('');
  const [finalizeSuccess, setFinalizeSuccess] = useState(false);

  const isOfficial = memberships.some((m) => m.role === 'official' || m.role === 'coordinator');
  // Simplification: treat any official/coordinator as potential primary official for UI
  const isPrimary = isOfficial;

  const resultsQuery = useQuery<{ results: ResultData[] }, ApiError>({
    queryKey: ['heat-results', heatId],
    queryFn: () => getHeatResults(heatId!),
    enabled: !!heatId,
  });

  const previewMutation = useMutation({
    mutationFn: () => reconcileHeat(heatId!, false),
    onSuccess: (data) => {
      setReconcilePreview(data.entries);
      setReconcileAllAgreed(data.all_agreed);
      setActionError('');
    },
    onError: (err: ApiError) => setActionError(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: () => reconcileHeat(heatId!, true),
    onSuccess: (data) => {
      setReconcilePreview(data.entries);
      setReconcileAllAgreed(data.all_agreed);
      void queryClient.invalidateQueries({ queryKey: ['heat-results', heatId] });
      setActionError('');
    },
    onError: (err: ApiError) => setActionError(err.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeHeat(heatId!),
    onSuccess: () => {
      setFinalizeSuccess(true);
      setActionError('');
    },
    onError: (err: ApiError) => setActionError(err.message),
  });

  const results = resultsQuery.data?.results ?? [];
  const hasResults = results.length > 0;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to={`/races`} className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Heat Review</h1>
          <p className="text-sm text-gray-500 mt-1">Heat ID: {heatId}</p>
        </div>

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {actionError}
          </div>
        )}

        {/* Reconciliation panel */}
        {isOfficial && (
          <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <h2 className="font-semibold text-gray-800">Reconciliation</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors disabled:opacity-60"
              >
                {previewMutation.isPending ? 'Previewing…' : 'Preview Reconciliation'}
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors disabled:opacity-60"
              >
                {saveMutation.isPending ? 'Applying…' : 'Apply & Save Reconciliation'}
              </button>
            </div>

            {reconcilePreview && (
              <div className="space-y-2">
                <div className={`text-sm font-medium rounded-lg px-3 py-2 ${
                  reconcileAllAgreed
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                }`}>
                  {reconcileAllAgreed ? 'All officials agreed — no conflicts.' : 'Some entries need review (conflicts detected).'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b">
                        <th className="px-3 py-2">Entry</th>
                        <th className="px-3 py-2">Place</th>
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Conflict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconcilePreview.map((e) => (
                        <tr key={e.entryId} className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{e.entryId.slice(-6)}</td>
                          <td className="px-3 py-2">{e.place}</td>
                          <td className="px-3 py-2 font-mono">{formatTime(e.timeMs)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              e.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {e.status === 'ok' ? 'OK' : 'Review Needed'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-red-500">{e.conflict_reason ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Results table */}
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-800">Results</h2>
          </div>
          {resultsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !hasResults ? (
            <p className="px-4 py-4 text-sm text-gray-400">No results recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b">
                    <th className="px-3 py-2">Athlete / Team</th>
                    <th className="px-3 py-2">Place</th>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">{isPrimary ? 'Action' : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <ResultRow
                      key={r.id}
                      result={r}
                      heatId={heatId!}
                      isPrimary={isPrimary}
                      onSaved={() => void queryClient.invalidateQueries({ queryKey: ['heat-results', heatId] })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Finalize button */}
        {isPrimary && (
          <section>
            {finalizeSuccess ? (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
                Heat finalized successfully.
              </div>
            ) : (
              <button
                onClick={() => {
                  if (confirm('Finalize this heat? This marks results as complete.')) {
                    finalizeMutation.mutate();
                  }
                }}
                disabled={finalizeMutation.isPending || !hasResults}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-3 text-sm min-h-11 transition-colors"
              >
                {finalizeMutation.isPending ? 'Finalizing…' : 'Finalize Heat'}
              </button>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
