import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { listAdminLeagues, createAdminLeague, searchUserByEmail, assignCoordinator } from '../api/admin.js';
import type { LeagueSummary, UserSearchResult } from '../api/admin.js';
import { ApiError } from '../api/client.js';

export default function AdminPage() {
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();
  const isAdmin = memberships.some((m) => m.role === 'system_admin');

  // Create league state
  const [leagueName, setLeagueName] = useState('');
  const [divisionName, setDivisionName] = useState('');
  const [createError, setCreateError] = useState('');

  // Invite coordinator state
  const [searchEmail, setSearchEmail] = useState('');
  const [foundUser, setFoundUser] = useState<UserSearchResult | null | undefined>(undefined);
  const [searchError, setSearchError] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteError, setInviteError] = useState('');

  const leaguesQuery = useQuery<{ leagues: LeagueSummary[] }, ApiError>({
    queryKey: ['adminLeagues'],
    queryFn: listAdminLeagues,
    enabled: isAdmin,
  });

  const createLeagueMutation = useMutation({
    mutationFn: createAdminLeague,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminLeagues'] });
      setLeagueName('');
      setDivisionName('');
      setCreateError('');
    },
    onError: (err: ApiError) => setCreateError(err.message),
  });

  const assignMutation = useMutation({
    mutationFn: ({ divisionId, userId }: { divisionId: string; userId: string }) =>
      assignCoordinator(divisionId, userId),
    onSuccess: () => {
      setInviteSuccess('Coordinator assigned successfully.');
      setInviteError('');
      setFoundUser(undefined);
      setSearchEmail('');
      setSelectedDivisionId('');
    },
    onError: (err: ApiError) => setInviteError(err.message),
  });

  const handleSearch = async () => {
    setFoundUser(undefined);
    setSearchError('');
    setInviteSuccess('');
    if (!searchEmail.trim()) return;
    try {
      const result = await searchUserByEmail(searchEmail.trim());
      setFoundUser(result.user);
      if (!result.user) setSearchError('No user found with that email.');
    } catch {
      setSearchError('Search failed.');
    }
  };

  const allDivisions = (leaguesQuery.data?.leagues ?? []).flatMap((l) =>
    l.divisions.map((d) => ({ id: d.id, label: `${l.name} › ${d.name}` }))
  );

  if (!isAdmin) {
    return (
      <Layout>
        <div className="text-red-600">System admins only.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>

        {/* Leagues & Divisions */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Leagues & Divisions</h2>
          {leaguesQuery.isLoading ? (
            <div className="flex justify-center py-4"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : (leaguesQuery.data?.leagues ?? []).length === 0 ? (
            <p className="text-gray-500 text-sm">No leagues yet.</p>
          ) : (
            <ul className="space-y-2">
              {(leaguesQuery.data?.leagues ?? []).map((l) => (
                <li key={l.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <p className="font-medium text-gray-900">{l.name}</p>
                  <ul className="mt-1 space-y-0.5 pl-3">
                    {l.divisions.map((d) => (
                      <li key={d.id} className="text-sm text-gray-600">— {d.name}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Create League & Division</h3>
            {createError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{createError}</div>}
            <input type="text" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder="League name" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11" />
            <input type="text" value={divisionName} onChange={(e) => setDivisionName(e.target.value)} placeholder="Division name" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11" />
            <button
              onClick={() => { if (leagueName.trim() && divisionName.trim()) createLeagueMutation.mutate({ leagueName: leagueName.trim(), divisionName: divisionName.trim() }); }}
              disabled={createLeagueMutation.isPending || !leagueName.trim() || !divisionName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
            >
              {createLeagueMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </section>

        {/* Invite Coordinator */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Assign Coordinator</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <p className="text-sm text-gray-600">Search for an existing user by email, then assign them as coordinator to a division.</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
                placeholder="user@example.com"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
              <button onClick={() => void handleSearch()} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors">
                Search
              </button>
            </div>
            {searchError && <p className="text-sm text-red-600">{searchError}</p>}
            {foundUser && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800">
                Found: <strong>{foundUser.name}</strong> ({foundUser.email})
              </div>
            )}
            {foundUser && (
              <div className="space-y-2">
                <select
                  value={selectedDivisionId}
                  onChange={(e) => setSelectedDivisionId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11 bg-white"
                >
                  <option value="">— Select division —</option>
                  {allDivisions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
                {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
                {inviteSuccess && <p className="text-sm text-green-700">{inviteSuccess}</p>}
                <button
                  onClick={() => { if (foundUser && selectedDivisionId) assignMutation.mutate({ divisionId: selectedDivisionId, userId: foundUser.id }); }}
                  disabled={!selectedDivisionId || assignMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
                >
                  {assignMutation.isPending ? 'Assigning…' : 'Assign as Coordinator'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
