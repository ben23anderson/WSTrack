import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { getDivision } from '../api/divisions.js';
import type { DivisionData } from '../api/divisions.js';
import { ApiError } from '../api/client.js';
import { useAuthContext } from '../context/AuthContext.js';
import { Link } from 'react-router-dom';

export default function DivisionDetail() {
  const { divisionId } = useParams<{ divisionId: string }>();
  const { memberships } = useAuthContext();

  const { data, isLoading, error } = useQuery<{ division: DivisionData }, ApiError>({
    queryKey: ['division', divisionId],
    queryFn: () => getDivision(divisionId!),
    enabled: !!divisionId,
  });

  const isCoordinator = memberships.some(
    (m) => m.role === 'coordinator' && m.divisionId === divisionId
  );

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

  const navCards = [
    {
      label: 'Race Days',
      description: 'Schedule and manage race days',
      to: `/divisions/${divisionId}/race-days`,
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700',
    },
    {
      label: 'Teams',
      description: 'View and manage teams',
      to: `/divisions/${divisionId}/teams`,
      color: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700',
    },
    ...(isCoordinator
      ? [
          {
            label: 'Configuration',
            description: 'Distances, classifications, and settings',
            to: `/divisions/${divisionId}/config`,
            color: 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700',
          },
        ]
      : []),
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-500">{division.league.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">{division.name}</h1>
        </div>

        <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {navCards.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className={`flex flex-col gap-1 border rounded-xl px-5 py-4 min-h-11 transition-colors ${card.color}`}
            >
              <span className="font-semibold text-base">{card.label}</span>
              <span className="text-xs opacity-70">{card.description}</span>
            </Link>
          ))}
        </nav>
      </div>
    </Layout>
  );
}
