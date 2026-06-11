import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { listRaceDays, createRaceDay } from '../api/raceDays.js';
import type { RaceDayData } from '../api/raceDays.js';
import { getDivisionOfficials } from '../api/divisions.js';
import type { OfficialSummary } from '../api/divisions.js';
import { ApiError } from '../api/client.js';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RaceDaysPage() {
  const { divisionId } = useParams<{ divisionId: string }>();
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();

  const isCoordinator = memberships.some(
    (m) => m.role === 'coordinator' && m.divisionId === divisionId
  );

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [primaryOfficialId, setPrimaryOfficialId] = useState('');
  const [selectedOfficialIds, setSelectedOfficialIds] = useState<string[]>([]);
  const [formError, setFormError] = useState('');

  const { data: officialsData } = useQuery<{ officials: OfficialSummary[] }, ApiError>({
    queryKey: ['divisionOfficials', divisionId],
    queryFn: () => getDivisionOfficials(divisionId!),
    enabled: !!divisionId && isCoordinator,
  });

  const availableOfficials = officialsData?.officials ?? [];

  const { data, isLoading, error } = useQuery<{ raceDays: RaceDayData[] }, ApiError>({
    queryKey: ['raceDays', divisionId],
    queryFn: () => listRaceDays(divisionId!),
    enabled: !!divisionId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      date: string;
      primary_official_id?: string;
      official_ids?: string[];
    }) => createRaceDay(divisionId!, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['raceDays', divisionId] });
      setShowForm(false);
      setName('');
      setDate('');
      setPrimaryOfficialId('');
      setSelectedOfficialIds([]);
      setFormError('');
    },
    onError: (err: ApiError) => setFormError(err.message),
  });

  const handleOfficialCheckbox = (officialId: string, checked: boolean) => {
    setSelectedOfficialIds((prev) =>
      checked ? [...prev, officialId] : prev.filter((id) => id !== officialId)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim() || !date) { setFormError('Name and date are required'); return; }
    createMutation.mutate({
      name: name.trim(),
      date,
      primary_official_id: primaryOfficialId || undefined,
      official_ids: selectedOfficialIds,
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/divisions/${divisionId}`} className="text-blue-600 hover:underline text-sm">
              ← Division
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Race Days</h1>
          </div>
          {isCoordinator && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
            >
              + Race Day
            </button>
          )}
        </div>

        {isCoordinator && showForm && (
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-gray-200 rounded-xl p-4 space-y-3"
          >
            <h2 className="text-base font-semibold text-gray-700">New Race Day</h2>
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring Regatta Day 1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Official (optional)
              </label>
              <select
                value={primaryOfficialId}
                onChange={(e) => setPrimaryOfficialId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11 bg-white"
              >
                <option value="">— None —</option>
                {availableOfficials.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Officials (optional)
              </label>
              {availableOfficials.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No officials found in this division.</p>
              ) : (
                <div className="border border-gray-300 rounded-lg divide-y divide-gray-100">
                  {availableOfficials.map((o) => (
                    <label
                      key={o.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 min-h-11"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOfficialIds.includes(o.id)}
                        onChange={(e) => handleOfficialCheckbox(o.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-800">
                        {o.name}
                        <span className="ml-1 text-gray-400 text-xs">({o.email})</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
              >
                {createMutation.isPending ? 'Creating…' : 'Create Race Day'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(''); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-red-600 text-sm">{error.message}</div>
        ) : (data?.raceDays ?? []).length === 0 ? (
          <p className="text-center text-gray-500 py-12">No race days yet.</p>
        ) : (
          <ul className="space-y-2">
            {(data?.raceDays ?? []).map((rd) => (
              <li key={rd.id}>
                <Link
                  to={`/race-days/${rd.id}`}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors min-h-11"
                >
                  <div>
                    <p className="font-medium text-gray-900">{rd.name}</p>
                    <p className="text-xs text-gray-500">{formatDate(rd.date)}</p>
                    {rd.primaryOfficial && (
                      <p className="text-xs text-gray-400">Official: {rd.primaryOfficial.name}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-gray-500">
                      {rd._count?.races ?? 0} race{(rd._count?.races ?? 0) !== 1 ? 's' : ''}
                    </span>
                    <svg className="inline ml-2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
