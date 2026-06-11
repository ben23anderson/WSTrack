import { Link } from 'react-router-dom';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';

export default function Dashboard() {
  const { user, memberships } = useAuthContext();

  const divisionMemberships = memberships.filter((m) => m.divisionId && !m.teamId);
  const teamMemberships = memberships.filter((m) => m.teamId);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
          <p className="text-gray-500 text-sm mt-1">Your divisions and teams</p>
        </div>

        {divisionMemberships.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">Divisions</h2>
            <ul className="space-y-2">
              {divisionMemberships.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/divisions/${m.divisionId!}`}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors min-h-11"
                  >
                    <span className="font-medium text-gray-900">{m.division?.name ?? m.divisionId}</span>
                    <span className="text-xs text-gray-400 capitalize">{m.role.replace('_', ' ')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {teamMemberships.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3">Teams</h2>
            <ul className="space-y-2">
              {teamMemberships.map((m) => {
                const coachDivisionId = m.team?.divisionId ?? null;
                const isCoach = m.role === 'head_coach' || m.role === 'assistant_coach';
                return (
                  <li key={m.id} className="space-y-1">
                    <Link
                      to={`/teams/${m.teamId!}`}
                      className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors min-h-11"
                    >
                      <span className="font-medium text-gray-900">{m.team?.name ?? m.teamId}</span>
                      <span className="text-xs text-gray-400 capitalize">{m.role.replace('_', ' ')}</span>
                    </Link>
                    {isCoach && coachDivisionId && (
                      <Link
                        to={`/divisions/${coachDivisionId}/race-days`}
                        className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5 hover:bg-gray-50 transition-colors min-h-11 ml-4"
                      >
                        <span className="text-sm text-gray-700">Race Days</span>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {memberships.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 space-y-4">
            <p>You don't belong to any divisions or teams yet.</p>
            <p className="text-sm mt-2">Ask your coordinator to add you, or accept an invite.</p>
            <Link
              to="/leagues/new"
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-6 py-3 text-sm min-h-11 transition-colors"
            >
              Set up your organization
            </Link>
          </div>
        )}

        {memberships.length > 0 &&
          memberships.some((m) => m.role === 'coordinator') &&
          !memberships.some((m) => m.role === 'coordinator' && m.divisionId) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-800 text-sm">
              Your coordinator account doesn't have a division assigned yet. Contact your league
              administrator to have a division linked to your account.
            </div>
          )}
      </div>
    </Layout>
  );
}
