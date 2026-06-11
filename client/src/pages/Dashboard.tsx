import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import { getDivision } from '../api/divisions.js';

function RoleBadge({ role }: { role: string }) {
  const label = role.replace('_', ' ');
  const colors =
    role === 'head_coach' ? 'bg-blue-100 text-blue-700' :
    role === 'assistant_coach' ? 'bg-indigo-100 text-indigo-700' :
    role === 'official' ? 'bg-amber-100 text-amber-700' :
    'bg-gray-100 text-gray-600';
  return (
    <span className={`text-xs font-medium rounded-full px-2 py-0.5 capitalize ${colors}`}>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { user, memberships } = useAuthContext();

  const divisionMemberships = memberships.filter((m) => m.divisionId && !m.teamId);
  const teamMemberships = memberships.filter((m) => m.teamId);

  // Fetch division names for all unique divisions coaches belong to
  const uniqueDivisionIds = [...new Set(
    teamMemberships.map((m) => m.team?.divisionId).filter((id): id is string => !!id)
  )];

  const divisionQueries = useQueries({
    queries: uniqueDivisionIds.map((id) => ({
      queryKey: ['division', id],
      queryFn: () => getDivision(id),
      staleTime: 60_000,
    })),
  });

  const divisionsById: Record<string, { name: string; leagueName: string }> = {};
  uniqueDivisionIds.forEach((id, i) => {
    const d = divisionQueries[i]?.data?.division;
    if (d) divisionsById[id] = { name: d.name, leagueName: d.league.name };
  });

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
        </div>

        {/* ── Coordinator view ── */}
        {divisionMemberships.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-700">Divisions</h2>
            <ul className="space-y-2">
              {divisionMemberships.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/divisions/${m.divisionId!}`}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors min-h-11"
                  >
                    <span className="font-medium text-gray-900">{m.division?.name ?? m.divisionId}</span>
                    <RoleBadge role={m.role} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Coach / team view ── */}
        {teamMemberships.map((m) => {
          const divId = m.team?.divisionId;
          const divInfo = divId ? divisionsById[divId] : null;

          const navCards = [
            {
              label: 'Race Days',
              description: 'View the schedule and your lineups',
              to: divId ? `/divisions/${divId}/race-days` : '/',
              color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700',
            },
            {
              label: 'Roster',
              description: 'Manage athletes',
              to: `/teams/${m.teamId!}/roster`,
              color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700',
            },
            {
              label: 'Boats',
              description: 'Manage boat inventory',
              to: `/teams/${m.teamId!}/boats`,
              color: 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700',
            },
          ];

          return (
            <section key={m.id} className="space-y-4">
              <div>
                {divInfo && (
                  <p className="text-sm text-gray-500">{divInfo.leagueName} · {divInfo.name}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <h2 className="text-xl font-bold text-gray-900">{m.team?.name}</h2>
                  <RoleBadge role={m.role} />
                </div>
              </div>

              <nav className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {navCards.map((card) => (
                  <Link
                    key={card.to}
                    to={card.to}
                    className={`flex flex-col gap-1 border rounded-xl px-5 py-4 transition-colors ${card.color}`}
                  >
                    <span className="font-semibold text-base">{card.label}</span>
                    <span className="text-xs opacity-70">{card.description}</span>
                  </Link>
                ))}
              </nav>
            </section>
          );
        })}

        {/* ── Empty state ── */}
        {memberships.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 space-y-4">
            <p>You don't belong to any divisions or teams yet.</p>
            <p className="text-sm">Ask your coordinator to add you, or accept an invite.</p>
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
