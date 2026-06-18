import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

interface PublicLaneAssignment {
  lane: number;
  entry: {
    athlete: { name: string };
    lineup: { team: { name: string } };
  } | null;
}

interface PublicResult {
  place: number;
  entry: {
    athlete: { name: string };
    lineup: { team: { name: string } };
  } | null;
  timeMs: number | null;
}

interface PublicHeat {
  id: string;
  heatNumber: number;
  laneAssignments: PublicLaneAssignment[];
  results: PublicResult[];
}

interface PublicRace {
  id: string;
  status: string;
  orderIndex: number;
  laneCount: number;
  hasFinals: boolean;
  classification: { label: string } | null;
  distance: { label: string } | null;
  heats: PublicHeat[];
}

interface PublicRaceDay {
  id: string;
  name: string;
  date: string | null;
  division: { name: string; league: { name: string } };
  races: PublicRace[];
}

function formatTime(ms: number | null): string {
  if (ms === null) return '—';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return minutes > 0 ? `${minutes}:${seconds}` : `${seconds}s`;
}

const STATUS_COLORS: Record<string, string> = {
  setup: 'bg-gray-100 text-gray-600',
  boat_prep: 'bg-yellow-100 text-yellow-700',
  seeded: 'bg-blue-100 text-blue-700',
  live: 'bg-green-100 text-green-700',
  review: 'bg-orange-100 text-orange-700',
  published: 'bg-purple-100 text-purple-700',
};

export default function PublicRaceDayPage() {
  const { raceDayId } = useParams<{ raceDayId: string }>();

  const query = useQuery<{ raceDay: PublicRaceDay }, Error>({
    queryKey: ['public-race-day', raceDayId],
    queryFn: async () => {
      const res = await fetch(`/api/public/race-days/${raceDayId ?? ''}`);
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? 'Failed to load race day');
      }
      return res.json() as Promise<{ raceDay: PublicRaceDay }>;
    },
    enabled: !!raceDayId,
  });

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-gray-800">Race day not found</p>
          <p className="text-sm text-gray-500">{query.error?.message ?? 'An error occurred'}</p>
        </div>
      </div>
    );
  }

  const { raceDay } = query.data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-sm text-gray-500">{raceDay.division.league.name} · {raceDay.division.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">{raceDay.name}</h1>
          {raceDay.date && (
            <p className="text-sm text-gray-500">
              {new Date(raceDay.date).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </p>
          )}
        </div>

        {/* Races */}
        {raceDay.races.length === 0 ? (
          <p className="text-center text-gray-500 text-sm">No races scheduled.</p>
        ) : (
          <div className="space-y-6">
            {raceDay.races.map((race) => (
              <div key={race.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Race header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {race.classification?.label ?? 'Open'} · {race.distance?.label ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500">{race.laneCount} lanes</p>
                  </div>
                  <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${STATUS_COLORS[race.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {race.status}
                  </span>
                </div>

                {/* Heats */}
                {race.heats.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No heats yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {race.heats.map((heat) => (
                      <div key={heat.id} className="px-4 py-3 space-y-3">
                        <p className="text-sm font-medium text-gray-700">Heat {heat.heatNumber}</p>

                        {/* Results (if available) */}
                        {heat.results.length > 0 ? (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Results</p>
                            {heat.results.map((r) => (
                              <div key={r.place} className="flex items-center gap-3 text-sm">
                                <span className={`w-6 text-center font-bold ${r.place === 1 ? 'text-yellow-600' : r.place === 2 ? 'text-gray-500' : r.place === 3 ? 'text-orange-600' : 'text-gray-400'}`}>
                                  {r.place}
                                </span>
                                <span className="flex-1 text-gray-800">{r.entry?.athlete.name ?? '—'}</span>
                                <span className="text-xs text-gray-500">{r.entry?.lineup.team.name ?? '—'}</span>
                                <span className="text-xs font-mono text-gray-700">{formatTime(r.timeMs)}</span>
                              </div>
                            ))}
                          </div>
                        ) : heat.laneAssignments.length > 0 ? (
                          /* Lane assignments (seeded but not yet run) */
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Lane Draw</p>
                            {heat.laneAssignments.map((la) => (
                              <div key={la.lane} className="flex items-center gap-3 text-sm">
                                <span className="w-6 text-center text-gray-400 font-mono">{la.lane}</span>
                                <span className="flex-1 text-gray-800">{la.entry?.athlete.name ?? <span className="text-gray-300">—</span>}</span>
                                <span className="text-xs text-gray-500">{la.entry?.lineup.team.name ?? ''}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">Not yet seeded.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-300 pb-4">Powered by WSTrack</p>
      </div>
    </div>
  );
}
