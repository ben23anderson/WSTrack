import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { getDivision, createTeam } from '../api/divisions.js';
import type { DivisionData } from '../api/divisions.js';
import { ApiError } from '../api/client.js';
import { inviteUser } from '../api/teams.js';
import { useAuthContext } from '../context/AuthContext.js';

export default function DivisionDetail() {
  const { divisionId } = useParams<{ divisionId: string }>();
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();
  const [teamName, setTeamName] = useState('');
  const [formError, setFormError] = useState('');

  // Per-team invite state: teamId -> { email, role, error, token }
  const [inviteState, setInviteState] = useState<
    Record<string, { email: string; role: string; error: string; token: string | null }>
  >({});

  const { data, isLoading, error } = useQuery<{ division: DivisionData }, ApiError>({
    queryKey: ['division', divisionId],
    queryFn: () => getDivision(divisionId!),
    enabled: !!divisionId,
  });

  const isCoordinator = memberships.some(
    (m) => m.role === 'coordinator' && m.divisionId === divisionId
  );

  const createTeamMutation = useMutation({
    mutationFn: (name: string) => createTeam(divisionId!, { name }),
    onSuccess: () => {
      setTeamName('');
      setFormError('');
      void queryClient.invalidateQueries({ queryKey: ['division', divisionId] });
    },
    onError: (err: ApiError) => {
      setFormError(err.message);
    },
  });

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!teamName.trim()) {
      setFormError('Team name is required');
      return;
    }
    createTeamMutation.mutate(teamName.trim());
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="text-red-600">{error?.message ?? 'Division not found'}</div>
      </Layout>
    );
  }

  const { division } = data;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-500">{division.league.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">{division.name}</h1>
        </div>

        <section className="flex gap-3">
          <Link
            to={`/divisions/${divisionId}/race-days`}
            className="flex-1 flex items-center justify-center bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-medium min-h-11 transition-colors"
          >
            Race Days
          </Link>
          {isCoordinator && (
            <Link
              to={`/divisions/${divisionId}/config`}
              className="flex-1 flex items-center justify-center bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl px-4 py-3 text-sm font-medium min-h-11 transition-colors"
            >
              Distances &amp; Classifications
            </Link>
          )}
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Teams</h2>
          {division.teams.length > 0 ? (
            <ul className="space-y-4">
              {division.teams.map((team) => {
                const ts = inviteState[team.id] ?? { email: '', role: 'head_coach', error: '', token: null };
                const setTs = (patch: Partial<typeof ts>) =>
                  setInviteState((prev) => ({ ...prev, [team.id]: { ...ts, ...patch } }));

                const handleInvite = async (e: React.FormEvent) => {
                  e.preventDefault();
                  setTs({ error: '', token: null });
                  try {
                    const result = await inviteUser(team.id, { email: ts.email.trim(), role: ts.role });
                    setTs({ token: result.invite.token, email: '' });
                  } catch (err) {
                    setTs({ error: err instanceof ApiError ? err.message : 'Failed to send invite' });
                  }
                };

                return (
                  <li key={team.id} className="space-y-2">
                    <Link
                      to={`/teams/${team.id}`}
                      className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors min-h-11"
                    >
                      <span className="font-medium text-gray-900">{team.name}</span>
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>

                    {isCoordinator && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Invite to {team.name}</p>
                        {ts.token ? (
                          <div className="space-y-2">
                            <p className="text-xs text-green-700">Invite created. Share this link:</p>
                            <div className="flex items-center gap-2">
                              <input
                                readOnly
                                value={`${window.location.origin}/invites/${ts.token}`}
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white min-h-11 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/invites/${ts.token}`)}
                                className="shrink-0 border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white hover:bg-gray-100 min-h-11 transition-colors"
                              >
                                Copy
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setTs({ token: null })}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Send another invite
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={handleInvite} className="space-y-2">
                            {ts.error && (
                              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                                {ts.error}
                              </div>
                            )}
                            <input
                              type="email"
                              required
                              value={ts.email}
                              onChange={(e) => setTs({ email: e.target.value })}
                              placeholder="Email address"
                              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                            />
                            <select
                              value={ts.role}
                              onChange={(e) => setTs({ role: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11 bg-white"
                            >
                              <option value="head_coach">Head Coach</option>
                              <option value="assistant_coach">Assistant Coach</option>
                              <option value="official">Official</option>
                            </select>
                            <button
                              type="submit"
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
                            >
                              Send invite
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No teams yet.</p>
          )}
        </section>

        {isCoordinator && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">Add a Team</h2>
            <form
              onSubmit={handleCreateTeam}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
            >
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {formError}
                </div>
              )}
              <div>
                <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-1">
                  Team name
                </label>
                <input
                  id="teamName"
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                  placeholder="e.g. Westlake Paddlers"
                />
              </div>
              <button
                type="submit"
                disabled={createTeamMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
              >
                {createTeamMutation.isPending ? 'Adding…' : 'Add team'}
              </button>
            </form>
          </section>
        )}
      </div>
    </Layout>
  );
}
