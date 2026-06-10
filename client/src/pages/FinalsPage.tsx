import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { ApiError } from '../api/client.js';
import { listFinals, generateFinals, publishFinal, getFinalResults } from '../api/finals.js';
import type { FinalData, FinalResultData } from '../api/finals.js';

function formatTime(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const totalSecs = ms / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

function FinalCard({ final, raceId }: { final: FinalData; raceId: string }) {
  const queryClient = useQueryClient();
  const { memberships } = useAuthContext();
  const isOfficial = memberships.some((m) => m.role === 'official' || m.role === 'coordinator');

  const resultsQuery = useQuery<{ results: FinalResultData[] }, ApiError>({
    queryKey: ['final-results', final.id],
    queryFn: () => getFinalResults(final.id),
    retry: false,
  });

  const publishMutation = useMutation({
    mutationFn: () => publishFinal(final.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['final-results', final.id] });
      void queryClient.invalidateQueries({ queryKey: ['finals', raceId] });
    },
  });

  const results = resultsQuery.data?.results ?? [];
  const hasResults = results.some((r) => r.place !== null);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${
            final.type === 'A' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
          }`}>
            Final {final.type}
          </span>
          {final.startTs && (
            <span className="text-xs text-gray-500">
              Started {new Date(final.startTs).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/finals/${final.id}/officiate?raceId=${raceId}`}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2 py-1 font-medium"
          >
            Officiate
          </Link>
          <Link
            to={`/finals/${final.id}/review`}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-2 py-1 font-medium border border-gray-300"
          >
            Review
          </Link>
        </div>
      </div>

      {/* Lane assignments */}
      <div className="px-4 py-3">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Lane Assignments</h4>
        {final.laneAssignments.length === 0 ? (
          <p className="text-sm text-gray-400">No lane assignments yet.</p>
        ) : (
          <div className="space-y-1">
            {final.laneAssignments.map((la) => (
              <div key={la.id} className="flex items-center gap-3 text-sm">
                <span className="font-mono font-medium text-gray-700 w-8">L{la.lane}</span>
                <span className="text-gray-800">{la.entry.athlete.name}</span>
                <span className="text-gray-500 text-xs">{la.entry.lineup.team.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Final results (if published) */}
      {hasResults && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-3 mb-2">Final Results</h4>
          <div className="space-y-1">
            {[...results]
              .filter((r) => r.place !== null)
              .sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
              .map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="font-semibold text-gray-700 w-6">{r.place}</span>
                  <span className="text-gray-800">{r.entry.athlete.name}</span>
                  <span className="text-gray-500 text-xs">{r.entry.lineup.team.name}</span>
                  <span className="font-mono text-xs text-gray-500 ml-auto">{formatTime(r.timeMs)}</span>
                  {r.isFinal && (
                    <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5">Final</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Publish button for officials */}
      {isOfficial && !hasResults && (
        <div className="px-4 pb-4">
          {publishMutation.isError && (
            <p className="text-xs text-red-500 mb-2">{(publishMutation.error as ApiError).message}</p>
          )}
          <button
            onClick={() => {
              if (confirm(`Publish Final ${final.type} results?`)) {
                publishMutation.mutate();
              }
            }}
            disabled={publishMutation.isPending}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
          >
            {publishMutation.isPending ? 'Publishing…' : `Publish Final ${final.type}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function FinalsPage() {
  const { raceId } = useParams<{ raceId: string }>();
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();

  const isCoordinator = memberships.some((m) => m.role === 'coordinator');

  const finalsQuery = useQuery<{ finals: FinalData[] }, ApiError>({
    queryKey: ['finals', raceId],
    queryFn: () => listFinals(raceId!),
    enabled: !!raceId,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateFinals(raceId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finals', raceId] });
    },
  });

  const finals = finalsQuery.data?.finals ?? [];
  const hasFinalsGenerated = finals.length > 0;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to={`/races/${raceId}/results`} className="text-blue-600 hover:text-blue-800 text-sm">
            ← Results
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finals</h1>
          <p className="text-sm text-gray-500 mt-1">Race ID: {raceId}</p>
        </div>

        {/* Coordinator: generate finals */}
        {isCoordinator && (
          <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-gray-800">Manage Finals</h2>
            {generateMutation.isError && (
              <p className="text-sm text-red-500">{(generateMutation.error as ApiError).message}</p>
            )}
            <button
              onClick={() => {
                if (confirm(hasFinalsGenerated ? 'Regenerate finals? This will clear existing lane assignments.' : 'Generate finals from heat results?')) {
                  generateMutation.mutate();
                }
              }}
              disabled={generateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
            >
              {generateMutation.isPending ? 'Generating…' : hasFinalsGenerated ? 'Regenerate Finals' : 'Generate Finals'}
            </button>
          </section>
        )}

        {/* Loading */}
        {finalsQuery.isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {finalsQuery.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {finalsQuery.error.message}
          </div>
        )}

        {/* Empty state */}
        {!finalsQuery.isLoading && !hasFinalsGenerated && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg font-medium">No finals generated yet.</p>
            {isCoordinator && (
              <p className="text-sm mt-1">Publish heat results first, then generate finals.</p>
            )}
          </div>
        )}

        {/* Finals cards */}
        {hasFinalsGenerated && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {finals.map((final) => (
              <FinalCard key={final.id} final={final} raceId={raceId!} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
