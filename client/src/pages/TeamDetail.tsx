import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { getTeam, getMembers, inviteUser, updateMember, removeMember } from '../api/teams.js';
import type { TeamData, MemberData, AssistantPermissions } from '../api/teams.js';
import { ApiError } from '../api/client.js';
import { useAuthContext } from '../context/AuthContext.js';

const DEFAULT_PERMISSIONS: AssistantPermissions = {
  roster: false,
  boat_inventory: false,
  boat_assignments: false,
};

export default function TeamDetail() {
  const { teamId } = useParams<{ teamId: string }>();
  const { user, memberships } = useAuthContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'head_coach' | 'assistant_coach' | 'official'>('assistant_coach');
  const [invitePerms, setInvitePerms] = useState<AssistantPermissions>({ ...DEFAULT_PERMISSIONS });
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const { data: teamData, isLoading: teamLoading } = useQuery<{ team: TeamData }, ApiError>({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId!),
    enabled: !!teamId,
  });

  const isHeadCoach = memberships.some(
    (m) => m.role === 'head_coach' && m.teamId === teamId
  );
  const isCoordinator = memberships.some(
    (m) =>
      m.role === 'coordinator' &&
      m.divisionId === teamData?.team.division.id
  );
  const canManage = isHeadCoach || isCoordinator;

  const { data: membersData } = useQuery<{ members: MemberData[] }, ApiError>({
    queryKey: ['team-members', teamId],
    queryFn: () => getMembers(teamId!),
    enabled: !!teamId && isHeadCoach,
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteUser(teamId!, {
        email: inviteEmail,
        role: inviteRole,
        permissions: inviteRole === 'assistant_coach' ? invitePerms : undefined,
      }),
    onSuccess: () => {
      setInviteSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('assistant_coach');
      setInvitePerms({ ...DEFAULT_PERMISSIONS });
      setInviteError('');
    },
    onError: (err: ApiError) => {
      setInviteError(err.message);
      setInviteSuccess('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (membershipId: string) => removeMember(teamId!, membershipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
    },
  });

  const updatePermsMutation = useMutation({
    mutationFn: ({ membershipId, permissions }: { membershipId: string; permissions: AssistantPermissions }) =>
      updateMember(teamId!, membershipId, { permissions }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    inviteMutation.mutate();
  };

  const togglePerm = (key: keyof AssistantPermissions) => {
    setInvitePerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (teamLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!teamData) {
    return (
      <Layout>
        <div className="text-red-600">Team not found</div>
      </Layout>
    );
  }

  const { team } = teamData;
  const members = membersData?.members ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <p className="text-sm text-gray-500 mt-1">{team.division.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
        </div>

        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Team Pages</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/teams/${teamId}/roster`}
              className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:text-blue-700 transition-colors"
            >
              Roster
            </Link>
            <Link
              to={`/teams/${teamId}/boats`}
              className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:text-blue-700 transition-colors"
            >
              Boat Inventory
            </Link>
          </div>
        </section>

        {isHeadCoach && members.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">Team Members</h2>
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{m.user.name}</p>
                      <p className="text-xs text-gray-500">{m.user.email}</p>
                      <p className="text-xs text-gray-400 capitalize mt-0.5">{m.role.replace('_', ' ')}</p>
                    </div>
                    {m.user.id !== user?.id && (
                      <button
                        onClick={() => removeMutation.mutate(m.id)}
                        disabled={removeMutation.isPending}
                        className="text-xs text-red-500 hover:text-red-700 min-h-11 px-3 flex items-center"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {m.role === 'assistant_coach' && m.permissions && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['roster', 'boat_inventory', 'boat_assignments'] as const).map((perm) => {
                        const perms = m.permissions as unknown as AssistantPermissions;
                        const enabled = perms[perm];
                        return (
                          <button
                            key={perm}
                            onClick={() =>
                              updatePermsMutation.mutate({
                                membershipId: m.id,
                                permissions: {
                                  ...perms,
                                  [perm]: !enabled,
                                },
                              })
                            }
                            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                              enabled
                                ? 'bg-blue-100 text-blue-700 border-blue-200'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                          >
                            {perm.replace('_', ' ')}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {canManage && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">Invite Someone</h2>
            <form
              onSubmit={handleInvite}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-4"
            >
              {inviteError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  {inviteError}
                </div>
              )}
              {inviteSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">
                  {inviteSuccess}
                </div>
              )}
              <div>
                <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  id="inviteEmail"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
                  placeholder="coach@school.edu"
                />
              </div>
              <div>
                <label htmlFor="inviteRole" className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  id="inviteRole"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11 bg-white"
                >
                  <option value="head_coach">Head Coach</option>
                  <option value="assistant_coach">Assistant Coach</option>
                  <option value="official">Official</option>
                </select>
              </div>

              {inviteRole === 'assistant_coach' && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Permissions</p>
                  <div className="space-y-2">
                    {(['roster', 'boat_inventory', 'boat_assignments'] as const).map((perm) => (
                      <label key={perm} className="flex items-center gap-3 min-h-11 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={invitePerms[perm]}
                          onChange={() => togglePerm(perm)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 capitalize">{perm.replace('_', ' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={inviteMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
              >
                {inviteMutation.isPending ? 'Sending invite…' : 'Send invite'}
              </button>
            </form>
          </section>
        )}
      </div>
    </Layout>
  );
}
