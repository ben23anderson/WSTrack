import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.js';
import { createLeague } from '../api/leagues.js';
import { ApiError } from '../api/client.js';

export default function CreateLeaguePage() {
  const navigate = useNavigate();
  const [leagueName, setLeagueName] = useState('');
  const [divisionName, setDivisionName] = useState('');
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsPending(true);
    try {
      const result = await createLeague({ leagueName: leagueName.trim(), divisionName: divisionName.trim() });
      navigate(`/divisions/${result.division.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Set up your organization</h1>
          <p className="text-gray-500 text-sm mt-1">
            Create a league and your first division to get started.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-xl p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="leagueName" className="block text-sm font-medium text-gray-700 mb-1">
              League name
            </label>
            <input
              id="leagueName"
              type="text"
              required
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              placeholder="e.g. Pacific Northwest Kayak League"
            />
          </div>

          <div>
            <label htmlFor="divisionName" className="block text-sm font-medium text-gray-700 mb-1">
              Division name
            </label>
            <input
              id="divisionName"
              type="text"
              required
              value={divisionName}
              onChange={(e) => setDivisionName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              placeholder="e.g. 2024 Season"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
          >
            {isPending ? 'Creating…' : 'Create league & division'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
