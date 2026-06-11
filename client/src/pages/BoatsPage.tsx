import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useTeamAccess } from '../hooks/useTeamAccess.js';
import { listBoats, createBoat, updateBoat, deleteBoat, bulkCreateBoats } from '../api/boats.js';
import type { BoatData } from '../api/boats.js';
import { ApiError } from '../api/client.js';

interface BoatFormData {
  number: string;
  model: string;
  is_double: boolean;
}

const DEFAULT_FORM: BoatFormData = {
  number: '',
  model: '',
  is_double: false,
};

function boatToForm(boat: BoatData): BoatFormData {
  return {
    number: boat.number,
    model: boat.model ?? '',
    is_double: boat.isDouble,
  };
}

interface BoatFormProps {
  initial?: BoatFormData;
  onSubmit: (data: BoatFormData) => void;
  onCancel: () => void;
  isPending: boolean;
}

function BoatForm({ initial = DEFAULT_FORM, onSubmit, onCancel, isPending }: BoatFormProps) {
  const [form, setForm] = useState<BoatFormData>(initial);

  const set = <K extends keyof BoatFormData>(key: K, value: BoatFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.number.trim()) onSubmit({ ...form, number: form.number.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Boat Number *</label>
          <input
            type="text"
            required
            value={form.number}
            onChange={(e) => set('number', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
            placeholder="e.g. 42"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
          <input
            type="text"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
            placeholder="e.g. Stellar"
          />
        </div>
      </div>
      <label className="flex items-center gap-3 min-h-11 cursor-pointer">
        <input
          type="checkbox"
          checked={form.is_double}
          onChange={(e) => set('is_double', e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">Double (2-person) boat</span>
      </label>
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

interface BoatRowProps {
  boat: BoatData;
  teamId: string;
  canEdit: boolean;
  onDelete: (id: string) => void;
}

function BoatRow({ boat, teamId, canEdit, onDelete }: BoatRowProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: BoatFormData) =>
      updateBoat(teamId, boat.id, {
        number: data.number,
        model: data.model || undefined,
        is_double: data.is_double,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boats', teamId] });
      setIsEditing(false);
    },
  });

  if (isEditing) {
    return (
      <div className="bg-white border border-blue-200 rounded-xl p-4 col-span-full">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Edit Boat #{boat.number}</h3>
        <BoatForm
          initial={boatToForm(boat)}
          onSubmit={(data) => updateMutation.mutate(data)}
          onCancel={() => setIsEditing(false)}
          isPending={updateMutation.isPending}
        />
      </div>
    );
  }

  return (
    <>
      {/* Mobile card */}
      <div className="md:hidden bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">#{boat.number}</p>
            {boat.model && <p className="text-sm text-gray-500">{boat.model}</p>}
            <p className="text-xs text-gray-400 mt-0.5">{boat.isDouble ? 'Double' : 'Single'}</p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs text-blue-600 hover:text-blue-800 min-h-8 px-2"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(boat.id)}
                className="text-xs text-red-500 hover:text-red-700 min-h-8 px-2"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Desktop table row */}
      <tr className="hidden md:table-row border-b border-gray-100 last:border-0">
        <td className="py-3 px-4 text-sm font-medium text-gray-900">#{boat.number}</td>
        <td className="py-3 px-4 text-sm text-gray-600">{boat.model ?? '—'}</td>
        <td className="py-3 px-4 text-sm text-gray-600">{boat.isDouble ? 'Double' : 'Single'}</td>
        {canEdit && (
          <td className="py-3 px-4 text-sm">
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(true)}
                className="text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(boat.id)}
                className="text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </td>
        )}
      </tr>
    </>
  );
}

// ─── CSV / Bulk Import ─────────────────────────────────────────────────────────

interface BulkImportPanelProps {
  teamId: string;
  onDone: () => void;
}

function BulkImportPanel({ teamId, onDone }: BulkImportPanelProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<{ number: string; model: string; is_double: boolean }[]>([]);
  const [parseError, setParseError] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);

  const bulkMutation = useMutation({
    mutationFn: (boats: { number: string; model?: string; is_double: boolean }[]) =>
      bulkCreateBoats(teamId, boats),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['boats', teamId] });
      setImportResult(`Imported ${data.count} boat${data.count !== 1 ? 's' : ''}.`);
      setCsvText('');
      setPreview([]);
    },
  });

  function parseCsv(text: string) {
    setParseError('');
    setImportResult(null);
    const lines = text.trim().split('\n').filter((l) => l.trim());
    if (lines.length === 0) { setPreview([]); return; }

    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('number') || firstLine.includes('model') || firstLine.includes('double');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const rows: { number: string; model: string; is_double: boolean }[] = [];
    for (const line of dataLines) {
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      const number = parts[0] ?? '';
      const model = parts[1] ?? '';
      const doubleRaw = (parts[2] ?? '').toLowerCase();
      const is_double = doubleRaw === 'true' || doubleRaw === 'yes' || doubleRaw === '1';
      if (!number) continue;
      rows.push({ number, model, is_double });
    }

    if (rows.length === 0) {
      setParseError('No valid rows found. Expected: number, model, is_double');
      setPreview([]);
      return;
    }
    if (rows.length > 500) {
      setParseError('Maximum 500 boats per import.');
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-700">Bulk Import Boats</h2>
        <button onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
      </div>

      <p className="text-xs text-gray-500">
        CSV format: <code className="bg-gray-100 px-1 rounded">number, model, is_double</code>{' '}
        (header row optional; is_double: true/yes/1 for doubles)
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
          placeholder={'number,model,is_double\n42,Stellar,false\n7,Epic,false\n3,Epic,true'}
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
          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left text-gray-500">Number</th>
                  <th className="px-3 py-1.5 text-left text-gray-500">Model</th>
                  <th className="px-3 py-1.5 text-left text-gray-500">Type</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-medium text-gray-800">#{row.number}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.model || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.is_double ? 'Double' : 'Single'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => bulkMutation.mutate(preview.map((r) => ({ number: r.number, model: r.model || undefined, is_double: r.is_double })))}
            disabled={bulkMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
          >
            {bulkMutation.isPending ? 'Importing…' : `Import ${preview.length} Boats`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function BoatsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { canManageBoatInventory } = useTeamAccess(teamId ?? '');
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<{ boats: BoatData[] }, ApiError>({
    queryKey: ['boats', teamId],
    queryFn: () => listBoats(teamId!),
    enabled: !!teamId,
  });

  const createMutation = useMutation({
    mutationFn: (formData: BoatFormData) =>
      createBoat(teamId!, {
        number: formData.number,
        model: formData.model || undefined,
        is_double: formData.is_double,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boats', teamId] });
      setShowAddForm(false);
      setError('');
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (boatId: string) => deleteBoat(teamId!, boatId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boats', teamId] });
    },
    onError: (err: ApiError) => setError(err.message),
  });

  const boats = data?.boats ?? [];

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Boat Inventory</h1>
          {canManageBoatInventory && (
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
                  Add Boat
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
          <BulkImportPanel teamId={teamId!} onDone={() => setShowBulkImport(false)} />
        )}

        {showAddForm && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h2 className="text-base font-semibold text-gray-700 mb-3">New Boat</h2>
            <BoatForm
              onSubmit={(data) => createMutation.mutate(data)}
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
        ) : boats.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            No boats yet.{canManageBoatInventory ? ' Add one above.' : ''}
          </p>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden space-y-3">
              {boats.map((boat) => (
                <BoatRow
                  key={boat.id}
                  boat={boat}
                  teamId={teamId!}
                  canEdit={canManageBoatInventory}
                  onDelete={(id) => deleteMutation.mutate(id)}
                />
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Number
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Model
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Type
                    </th>
                    {canManageBoatInventory && (
                      <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {boats.map((boat) => (
                    <BoatRow
                      key={boat.id}
                      boat={boat}
                      teamId={teamId!}
                      canEdit={canManageBoatInventory}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
