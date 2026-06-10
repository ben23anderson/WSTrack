import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useTeamAccess } from '../hooks/useTeamAccess.js';
import { listBoats, createBoat, updateBoat, deleteBoat } from '../api/boats.js';
import type { BoatData } from '../api/boats.js';
import { ApiError } from '../api/client.js';

interface BoatFormData {
  number: string;
  model: string;
  is_double: boolean;
  model_rank: number;
  number_rank: number;
}

const DEFAULT_FORM: BoatFormData = {
  number: '',
  model: '',
  is_double: false,
  model_rank: 0,
  number_rank: 0,
};

function boatToForm(boat: BoatData): BoatFormData {
  return {
    number: boat.number,
    model: boat.model ?? '',
    is_double: boat.isDouble,
    model_rank: boat.modelRank,
    number_rank: boat.numberRank,
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Model Rank</label>
          <input
            type="number"
            value={form.model_rank}
            onChange={(e) => set('model_rank', parseInt(e.target.value, 10) || 0)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Number Rank</label>
          <input
            type="number"
            value={form.number_rank}
            onChange={(e) => set('number_rank', parseInt(e.target.value, 10) || 0)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
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
        model_rank: data.model_rank,
        number_rank: data.number_rank,
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
            <p className="text-xs text-gray-400 mt-0.5">
              {boat.isDouble ? 'Double' : 'Single'} &middot; ModelRank {boat.modelRank} &middot; NumRank {boat.numberRank}
            </p>
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
        <td className="py-3 px-4 text-sm text-gray-500">{boat.modelRank}</td>
        <td className="py-3 px-4 text-sm text-gray-500">{boat.numberRank}</td>
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

export default function BoatsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { canManageBoatInventory } = useTeamAccess(teamId ?? '');
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
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
        model_rank: formData.model_rank,
        number_rank: formData.number_rank,
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
          {canManageBoatInventory && !showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
            >
              Add Boat
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
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Model Rank
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Num Rank
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
