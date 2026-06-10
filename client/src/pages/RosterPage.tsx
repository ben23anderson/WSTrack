import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useTeamAccess } from '../hooks/useTeamAccess.js';
import {
  listAthletes,
  createAthlete,
  updateAthlete,
  deleteAthlete,
  uploadAthletePhoto,
  upsertBestTime,
  deleteBestTime,
} from '../api/athletes.js';
import type { AthleteData, BestTimeData } from '../api/athletes.js';
import { ApiError } from '../api/client.js';

/** Parse "M:SS.ss" or "MM:SS.ss" to milliseconds. Returns null if invalid. */
function parseTimeToMs(input: string): number | null {
  const match = /^(\d+):(\d{2})\.(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const centiseconds = parseInt(match[3], 10);
  if (seconds >= 60) return null;
  return (minutes * 60 + seconds) * 1000 + centiseconds * 10;
}

/** Format milliseconds as "M:SS.ss". */
function formatMs(ms: number): string {
  const totalCenti = Math.round(ms / 10);
  const centi = totalCenti % 100;
  const totalSec = Math.floor(totalCenti / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${min}:${String(sec).padStart(2, '0')}.${String(centi).padStart(2, '0')}`;
}

function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
      <span className="text-blue-700 font-semibold text-lg">{initials}</span>
    </div>
  );
}

interface BestTimesEditorProps {
  teamId: string;
  athlete: AthleteData;
  canEdit: boolean;
}

function BestTimesEditor({ teamId, athlete, canEdit }: BestTimesEditorProps) {
  const queryClient = useQueryClient();
  const [timeInputs, setTimeInputs] = useState<Record<string, string>>({});
  const [newDistanceId, setNewDistanceId] = useState('');
  const [newTimeInput, setNewTimeInput] = useState('');
  const [error, setError] = useState('');

  const upsertMutation = useMutation({
    mutationFn: ({ distanceId, timeMs }: { distanceId: string; timeMs: number }) =>
      upsertBestTime(teamId, athlete.id, distanceId, {
        time_ms: timeMs,
        is_official: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['athletes', teamId] });
      setTimeInputs({});
      setNewDistanceId('');
      setNewTimeInput('');
      setError('');
    },
    onError: () => setError('Failed to save time'),
  });

  const deleteMutation = useMutation({
    mutationFn: (distanceId: string) => deleteBestTime(teamId, athlete.id, distanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['athletes', teamId] });
    },
  });

  const handleSaveEdit = (bt: BestTimeData) => {
    const input = timeInputs[bt.distanceId] ?? '';
    const ms = parseTimeToMs(input);
    if (ms === null) {
      setError('Invalid time format. Use M:SS.ss');
      return;
    }
    setError('');
    upsertMutation.mutate({ distanceId: bt.distanceId, timeMs: ms });
  };

  const handleAddNew = () => {
    if (!newDistanceId.trim()) {
      setError('Distance label is required');
      return;
    }
    const ms = parseTimeToMs(newTimeInput);
    if (ms === null) {
      setError('Invalid time format. Use M:SS.ss');
      return;
    }
    setError('');
    upsertMutation.mutate({ distanceId: newDistanceId.trim(), timeMs: ms });
  };

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Best Times</p>
      {athlete.bestTimes.length === 0 && (
        <p className="text-xs text-gray-400">No times recorded</p>
      )}
      {athlete.bestTimes
        .slice()
        .sort((a, b) => a.distance.sortOrder - b.distance.sortOrder)
        .map((bt) => (
          <div key={bt.distanceId} className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 w-20 flex-shrink-0">{bt.distance.label}</span>
            {canEdit && timeInputs[bt.distanceId] !== undefined ? (
              <>
                <input
                  type="text"
                  value={timeInputs[bt.distanceId]}
                  onChange={(e) =>
                    setTimeInputs((prev) => ({ ...prev, [bt.distanceId]: e.target.value }))
                  }
                  placeholder="M:SS.ss"
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={() => handleSaveEdit(bt)}
                  disabled={upsertMutation.isPending}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Save
                </button>
                <button
                  onClick={() =>
                    setTimeInputs((prev) => {
                      const next = { ...prev };
                      delete next[bt.distanceId];
                      return next;
                    })
                  }
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="font-mono text-gray-800">{formatMs(bt.timeMs)}</span>
                {canEdit && (
                  <>
                    <button
                      onClick={() =>
                        setTimeInputs((prev) => ({
                          ...prev,
                          [bt.distanceId]: formatMs(bt.timeMs),
                        }))
                      }
                      className="text-xs text-gray-400 hover:text-blue-600 ml-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(bt.distanceId)}
                      disabled={deleteMutation.isPending}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      {canEdit && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newDistanceId}
            onChange={(e) => setNewDistanceId(e.target.value)}
            placeholder="Distance ID"
            className="border border-gray-300 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={newTimeInput}
            onChange={(e) => setNewTimeInput(e.target.value)}
            placeholder="M:SS.ss"
            className="border border-gray-300 rounded px-2 py-1 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleAddNew}
            disabled={upsertMutation.isPending}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Add
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface AthleteFormProps {
  initialName?: string;
  initialGrade?: string;
  onSubmit: (name: string, grade: string) => void;
  onCancel: () => void;
  isPending: boolean;
}

function AthleteForm({ initialName = '', initialGrade = '', onSubmit, onCancel, isPending }: AthleteFormProps) {
  const [name, setName] = useState(initialName);
  const [grade, setGrade] = useState(initialGrade);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim(), grade.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
          placeholder="Athlete name"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Grade</label>
        <input
          type="text"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
          placeholder="e.g. 10"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface AthleteCardProps {
  athlete: AthleteData;
  teamId: string;
  canManageRoster: boolean;
  onDelete: (id: string) => void;
}

function AthleteCard({ athlete, teamId, canManageRoster, onDelete }: AthleteCardProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; grade?: string }) =>
      updateAthlete(teamId, athlete.id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['athletes', teamId] });
      setIsEditing(false);
    },
  });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    try {
      await uploadAthletePhoto(teamId, athlete.id, file);
      void queryClient.invalidateQueries({ queryKey: ['athletes', teamId] });
    } finally {
      setPhotoLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          {athlete.photoUrl ? (
            <img
              src={athlete.photoUrl}
              alt={athlete.name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <InitialsAvatar name={athlete.name} />
          )}
          {canManageRoster && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={photoLoading}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center text-xs disabled:opacity-60"
                title="Upload photo"
              >
                {photoLoading ? '…' : '+'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { void handlePhotoChange(e); }}
              />
            </>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <AthleteForm
              initialName={athlete.name}
              initialGrade={athlete.grade ?? ''}
              onSubmit={(name, grade) => updateMutation.mutate({ name, grade: grade || undefined })}
              onCancel={() => setIsEditing(false)}
              isPending={updateMutation.isPending}
            />
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">{athlete.name}</p>
                {athlete.grade && (
                  <p className="text-xs text-gray-500">Grade {athlete.grade}</p>
                )}
              </div>
              {canManageRoster && (
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 min-h-8 px-2"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(athlete.id)}
                    className="text-xs text-red-500 hover:text-red-700 min-h-8 px-2"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <BestTimesEditor
        teamId={teamId}
        athlete={athlete}
        canEdit={canManageRoster}
      />
    </div>
  );
}

export default function RosterPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { canManageRoster } = useTeamAccess(teamId ?? '');
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<{ athletes: AthleteData[] }, ApiError>({
    queryKey: ['athletes', teamId],
    queryFn: () => listAthletes(teamId!),
    enabled: !!teamId,
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; grade?: string }) =>
      createAthlete(teamId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['athletes', teamId] });
      setShowAddForm(false);
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (athleteId: string) => deleteAthlete(teamId!, athleteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['athletes', teamId] });
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const athletes = data?.athletes ?? [];

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Roster</h1>
          {canManageRoster && !showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
            >
              Add Athlete
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {showAddForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="text-base font-semibold text-gray-700 mb-3">New Athlete</h2>
            <AthleteForm
              onSubmit={(name, grade) =>
                createMutation.mutate({ name, grade: grade || undefined })
              }
              onCancel={() => {
                setShowAddForm(false);
                setError('');
              }}
              isPending={createMutation.isPending}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : athletes.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No athletes yet.{canManageRoster ? ' Add one above.' : ''}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {athletes.map((athlete) => (
              <AthleteCard
                key={athlete.id}
                athlete={athlete}
                teamId={teamId!}
                canManageRoster={canManageRoster}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
