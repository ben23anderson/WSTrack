import { useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  bulkCreateAthletes,
} from '../api/athletes.js';
import type { AthleteData, BestTimeData } from '../api/athletes.js';
import { getTeam } from '../api/teams.js';
import type { TeamData } from '../api/teams.js';
import { getDivisionClassifications } from '../api/divisions.js';
import type { ClassificationSummary } from '../api/divisions.js';
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
  initialClassificationId?: string;
  initialPreferredModel?: string;
  initialPreferredNumber?: string;
  classifications: ClassificationSummary[];
  onSubmit: (data: {
    name: string;
    grade: string;
    classificationId: string;
    preferred_boat_model: string;
    preferred_boat_number: string;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}

function AthleteForm({
  initialName = '',
  initialGrade = '',
  initialClassificationId = '',
  initialPreferredModel = '',
  initialPreferredNumber = '',
  classifications,
  onSubmit,
  onCancel,
  isPending,
}: AthleteFormProps) {
  const [name, setName] = useState(initialName);
  const [grade, setGrade] = useState(initialGrade);
  const [classificationId, setClassificationId] = useState(initialClassificationId);
  const [preferredModel, setPreferredModel] = useState(initialPreferredModel);
  const [preferredNumber, setPreferredNumber] = useState(initialPreferredNumber);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit({
      name: name.trim(),
      grade: grade.trim(),
      classificationId,
      preferred_boat_model: preferredModel.trim(),
      preferred_boat_number: preferredNumber.trim(),
    });
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
      {classifications.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Classification</label>
          <select
            value={classificationId}
            onChange={(e) => setClassificationId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11 bg-white"
          >
            <option value="">— None —</option>
            {classifications
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Boat Model</label>
          <input
            type="text"
            value={preferredModel}
            onChange={(e) => setPreferredModel(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
            placeholder="e.g. Stellar"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Boat #</label>
          <input
            type="text"
            value={preferredNumber}
            onChange={(e) => setPreferredNumber(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
            placeholder="e.g. 42"
          />
        </div>
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
  classifications: ClassificationSummary[];
  onDelete: (id: string) => void;
}

function AthleteCard({ athlete, teamId, canManageRoster, classifications, onDelete }: AthleteCardProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateMutation = useMutation({
    mutationFn: (data: {
      name?: string;
      grade?: string;
      classificationId?: string;
      preferred_boat_model?: string | null;
      preferred_boat_number?: string | null;
    }) => updateAthlete(teamId, athlete.id, data),
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
              initialClassificationId={athlete.classificationId ?? ''}
              initialPreferredModel={athlete.preferredBoatModel ?? ''}
              initialPreferredNumber={athlete.preferredBoatNumber ?? ''}
              classifications={classifications}
              onSubmit={(data) =>
                updateMutation.mutate({
                  name: data.name,
                  grade: data.grade || undefined,
                  classificationId: data.classificationId || undefined,
                  preferred_boat_model: data.preferred_boat_model || null,
                  preferred_boat_number: data.preferred_boat_number || null,
                })
              }
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
                {athlete.classification && (
                  <span className="inline-block text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 mt-0.5">
                    {athlete.classification.label}
                  </span>
                )}
                {(athlete.preferredBoatModel || athlete.preferredBoatNumber) && (
                  <p className="text-xs text-gray-400 mt-1">
                    Pref:{' '}
                    {athlete.preferredBoatNumber && <span className="font-medium text-gray-600">#{athlete.preferredBoatNumber}</span>}
                    {athlete.preferredBoatNumber && athlete.preferredBoatModel && ' · '}
                    {athlete.preferredBoatModel && <span className="text-gray-500">{athlete.preferredBoatModel}</span>}
                  </p>
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

// ─── CSV / Bulk Import ─────────────────────────────────────────────────────────

interface BulkImportPanelProps {
  teamId: string;
  classifications: ClassificationSummary[];
  onDone: () => void;
}

function BulkImportPanel({ teamId, classifications, onDone }: BulkImportPanelProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<{
    name: string;
    grade: string;
    classificationLabel: string;
    preferred_boat_model: string;
    preferred_boat_number: string;
  }[]>([]);
  const [parseError, setParseError] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);

  const bulkMutation = useMutation({
    mutationFn: (athletes: {
      name: string;
      grade?: string;
      classificationId?: string;
      preferred_boat_model?: string;
      preferred_boat_number?: string;
    }[]) => bulkCreateAthletes(teamId, athletes),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['athletes', teamId] });
      setImportResult(`Imported ${data.count} athlete${data.count !== 1 ? 's' : ''}.`);
      setCsvText('');
      setPreview([]);
    },
  });

  const classificationByLabel = new Map(
    classifications.map((c) => [c.label.toLowerCase(), c.id])
  );

  function parseCsv(text: string) {
    setParseError('');
    setImportResult(null);
    const lines = text.trim().split('\n').filter((l) => l.trim());
    if (lines.length === 0) { setPreview([]); return; }

    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('name') || firstLine.includes('grade');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const rows: typeof preview = [];
    for (const line of dataLines) {
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      const name = parts[0] ?? '';
      if (!name) continue;
      rows.push({
        name,
        grade: parts[1] ?? '',
        classificationLabel: parts[2] ?? '',
        preferred_boat_model: parts[3] ?? '',
        preferred_boat_number: parts[4] ?? '',
      });
    }

    if (rows.length === 0) {
      setParseError('No valid rows found. Expected: name, grade, classification, preferred_model, preferred_number');
      setPreview([]);
      return;
    }
    if (rows.length > 200) {
      setParseError('Maximum 200 athletes per import.');
      setPreview([]);
      return;
    }
    setPreview(rows);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      parseCsv(text);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    const athletes = preview.map((row) => ({
      name: row.name,
      grade: row.grade || undefined,
      classificationId: classificationByLabel.get(row.classificationLabel.toLowerCase()) || undefined,
      preferred_boat_model: row.preferred_boat_model || undefined,
      preferred_boat_number: row.preferred_boat_number || undefined,
    }));
    bulkMutation.mutate(athletes);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-700">Bulk Import Athletes</h2>
        <button onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
      </div>

      <p className="text-xs text-gray-500">
        CSV format: <code className="bg-gray-100 px-1 rounded">name, grade, classification, preferred_model, preferred_number</code>{' '}
        (header optional; last 3 columns optional)
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-2 text-sm min-h-10 transition-colors"
        >
          Choose CSV File
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Or paste CSV text</label>
        <textarea
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); parseCsv(e.target.value); }}
          rows={5}
          placeholder={'name,grade,classification,preferred_model,preferred_number\nJane Smith,10,Varsity,Stellar,42\nJohn Doe,11,,Epic,'}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{parseError}</div>
      )}

      {bulkMutation.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
          {(bulkMutation.error as ApiError).message}
        </div>
      )}

      {importResult && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-xs">{importResult}</div>
      )}

      {preview.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">{preview.length} rows ready to import:</p>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left text-gray-500">Name</th>
                  <th className="px-3 py-1.5 text-left text-gray-500">Grade</th>
                  <th className="px-3 py-1.5 text-left text-gray-500">Classification</th>
                  <th className="px-3 py-1.5 text-left text-gray-500">Pref Model</th>
                  <th className="px-3 py-1.5 text-left text-gray-500">Pref #</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-medium text-gray-800">{row.name}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.grade || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.classificationLabel || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.preferred_boat_model || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.preferred_boat_number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={bulkMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
          >
            {bulkMutation.isPending ? 'Importing…' : `Import ${preview.length} Athletes`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function RosterPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { canManageRoster } = useTeamAccess(teamId ?? '');
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [error, setError] = useState('');

  const { data: teamData } = useQuery<{ team: TeamData }, ApiError>({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId!),
    enabled: !!teamId,
  });

  const divisionId = teamData?.team.divisionId;

  const { data: classificationsData } = useQuery<{ classifications: ClassificationSummary[] }, ApiError>({
    queryKey: ['divisionClassifications', divisionId],
    queryFn: () => getDivisionClassifications(divisionId!),
    enabled: !!divisionId,
  });

  const classifications = classificationsData?.classifications ?? [];

  const { data, isLoading } = useQuery<{ athletes: AthleteData[] }, ApiError>({
    queryKey: ['athletes', teamId],
    queryFn: () => listAthletes(teamId!),
    enabled: !!teamId,
  });

  const createMutation = useMutation({
    mutationFn: (input: {
      name: string;
      grade?: string;
      classificationId?: string;
      preferred_boat_model?: string;
      preferred_boat_number?: string;
    }) => createAthlete(teamId!, input),
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
          <div>
            <Link
              to={`/teams/${teamId ?? ''}`}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Roster</h1>
          </div>
          {canManageRoster && (
            <div className="flex gap-2">
              {!showBulkImport && (
                <button
                  onClick={() => { setShowBulkImport(true); setShowAddForm(false); }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-3 py-2.5 text-sm min-h-11 transition-colors"
                >
                  Bulk Import
                </button>
              )}
              {!showAddForm && !showBulkImport && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
                >
                  Add Athlete
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {showBulkImport && (
          <BulkImportPanel
            teamId={teamId!}
            classifications={classifications}
            onDone={() => setShowBulkImport(false)}
          />
        )}

        {showAddForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="text-base font-semibold text-gray-700 mb-3">New Athlete</h2>
            <AthleteForm
              classifications={classifications}
              onSubmit={(data) =>
                createMutation.mutate({
                  name: data.name,
                  grade: data.grade || undefined,
                  classificationId: data.classificationId || undefined,
                  preferred_boat_model: data.preferred_boat_model || undefined,
                  preferred_boat_number: data.preferred_boat_number || undefined,
                })
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
                classifications={classifications}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
