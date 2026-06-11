import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../components/Layout.js';
import { useAuthContext } from '../context/AuthContext.js';
import {
  listDistances,
  createDistance,
  deleteDistance,
  listClassifications,
  createClassification,
  deleteClassification,
} from '../api/divisionConfig.js';
import type { DistanceData, ClassificationData } from '../api/divisionConfig.js';
import { listBoatModels, createBoatModel, deleteBoatModel } from '../api/boatModels.js';
import type { BoatModelData } from '../api/boatModels.js';
import { listTemplates, createTemplate, deleteTemplate } from '../api/raceDayTemplates.js';
import type { RaceDayTemplateData } from '../api/raceDayTemplates.js';
import { ApiError } from '../api/client.js';

export default function DivisionConfig() {
  const { divisionId } = useParams<{ divisionId: string }>();
  const { memberships } = useAuthContext();
  const queryClient = useQueryClient();

  const isCoordinator = memberships.some(
    (m) => m.role === 'coordinator' && m.divisionId === divisionId
  );

  // Distance state
  const [newDistanceLabel, setNewDistanceLabel] = useState('');
  const [newDistanceSortOrder, setNewDistanceSortOrder] = useState('0');
  const [distanceError, setDistanceError] = useState('');

  // Classification state
  const [newClassLabel, setNewClassLabel] = useState('');
  const [newClassIsDoubles, setNewClassIsDoubles] = useState(false);
  const [newClassSortOrder, setNewClassSortOrder] = useState('0');
  const [classError, setClassError] = useState('');

  // Boat Model state
  const [newModelBrand, setNewModelBrand] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [modelError, setModelError] = useState('');

  // Template state
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateError, setTemplateError] = useState('');

  const distancesQuery = useQuery<{ distances: DistanceData[] }, ApiError>({
    queryKey: ['distances', divisionId],
    queryFn: () => listDistances(divisionId!),
    enabled: !!divisionId,
  });

  const classificationsQuery = useQuery<{ classifications: ClassificationData[] }, ApiError>({
    queryKey: ['classifications', divisionId],
    queryFn: () => listClassifications(divisionId!),
    enabled: !!divisionId,
  });

  const boatModelsQuery = useQuery<{ models: BoatModelData[] }, ApiError>({
    queryKey: ['boatModels', divisionId],
    queryFn: () => listBoatModels(divisionId!),
    enabled: !!divisionId,
  });

  const templatesQuery = useQuery<{ templates: RaceDayTemplateData[] }, ApiError>({
    queryKey: ['templates', divisionId],
    queryFn: () => listTemplates(divisionId!),
    enabled: !!divisionId,
  });

  const createDistanceMutation = useMutation({
    mutationFn: (data: { label: string; sort_order?: number }) =>
      createDistance(divisionId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['distances', divisionId] });
      setNewDistanceLabel('');
      setNewDistanceSortOrder('0');
      setDistanceError('');
    },
    onError: (err: ApiError) => setDistanceError(err.message),
  });

  const deleteDistanceMutation = useMutation({
    mutationFn: (distanceId: string) => deleteDistance(divisionId!, distanceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['distances', divisionId] });
    },
    onError: (err: ApiError) => setDistanceError(err.message),
  });

  const createClassMutation = useMutation({
    mutationFn: (data: { label: string; is_doubles?: boolean; sort_order?: number }) =>
      createClassification(divisionId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['classifications', divisionId] });
      setNewClassLabel('');
      setNewClassIsDoubles(false);
      setNewClassSortOrder('0');
      setClassError('');
    },
    onError: (err: ApiError) => setClassError(err.message),
  });

  const deleteClassMutation = useMutation({
    mutationFn: (classificationId: string) => deleteClassification(divisionId!, classificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['classifications', divisionId] });
    },
    onError: (err: ApiError) => setClassError(err.message),
  });

  const createModelMutation = useMutation({
    mutationFn: (data: { brand: string; name: string }) =>
      createBoatModel(divisionId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boatModels', divisionId] });
      setNewModelBrand('');
      setNewModelName('');
      setModelError('');
    },
    onError: (err: ApiError) => setModelError(err.message),
  });

  const deleteModelMutation = useMutation({
    mutationFn: (modelId: string) => deleteBoatModel(divisionId!, modelId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boatModels', divisionId] });
    },
    onError: (err: ApiError) => setModelError(err.message),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: { name: string; races: { name: string }[] }) =>
      createTemplate(divisionId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates', divisionId] });
      setTemplateName('');
      setShowAddTemplate(false);
      setTemplateError('');
    },
    onError: (err: ApiError) => setTemplateError(err.message),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) => deleteTemplate(divisionId!, templateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates', divisionId] });
    },
    onError: (err: ApiError) => setTemplateError(err.message),
  });

  const handleAddDistance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDistanceLabel.trim()) { setDistanceError('Label is required'); return; }
    createDistanceMutation.mutate({
      label: newDistanceLabel.trim(),
      sort_order: parseInt(newDistanceSortOrder, 10) || 0,
    });
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassLabel.trim()) { setClassError('Label is required'); return; }
    createClassMutation.mutate({
      label: newClassLabel.trim(),
      is_doubles: newClassIsDoubles,
      sort_order: parseInt(newClassSortOrder, 10) || 0,
    });
  };

  const handleAddModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelBrand.trim() || !newModelName.trim()) { setModelError('Brand and name are required'); return; }
    createModelMutation.mutate({ brand: newModelBrand.trim(), name: newModelName.trim() });
  };

  const handleAddTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) { setTemplateError('Name is required'); return; }
    createTemplateMutation.mutate({ name: templateName.trim(), races: [] });
  };

  if (!isCoordinator) {
    return (
      <Layout>
        <div className="text-red-600">Coordinators only.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <Link to={`/divisions/${divisionId}`} className="text-blue-600 hover:underline text-sm">
            ← Division
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Division Config</h1>
        </div>

        {/* Distances */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Distances</h2>

          {distancesQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ul className="space-y-2">
              {(distancesQuery.data?.distances ?? []).map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3"
                >
                  <span className="font-medium text-gray-900">{d.label}</span>
                  <button
                    onClick={() => deleteDistanceMutation.mutate(d.id)}
                    disabled={deleteDistanceMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-700 min-h-8 px-2"
                  >
                    Delete
                  </button>
                </li>
              ))}
              {(distancesQuery.data?.distances ?? []).length === 0 && (
                <p className="text-gray-500 text-sm">No distances yet.</p>
              )}
            </ul>
          )}

          {distanceError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {distanceError}
            </div>
          )}

          <form onSubmit={handleAddDistance} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Add Distance</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDistanceLabel}
                onChange={(e) => setNewDistanceLabel(e.target.value)}
                placeholder="e.g. 2K"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
              <input
                type="number"
                value={newDistanceSortOrder}
                onChange={(e) => setNewDistanceSortOrder(e.target.value)}
                placeholder="Order"
                className="w-20 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
            </div>
            <button
              type="submit"
              disabled={createDistanceMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
            >
              {createDistanceMutation.isPending ? 'Adding…' : 'Add Distance'}
            </button>
          </form>
        </section>

        {/* Classifications */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Classifications</h2>

          {classificationsQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ul className="space-y-2">
              {(classificationsQuery.data?.classifications ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3"
                >
                  <div>
                    <span className="font-medium text-gray-900">{c.label}</span>
                    {c.isDoubles && (
                      <span className="ml-2 text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">
                        Doubles
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteClassMutation.mutate(c.id)}
                    disabled={deleteClassMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-700 min-h-8 px-2"
                  >
                    Delete
                  </button>
                </li>
              ))}
              {(classificationsQuery.data?.classifications ?? []).length === 0 && (
                <p className="text-gray-500 text-sm">No classifications yet.</p>
              )}
            </ul>
          )}

          {classError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {classError}
            </div>
          )}

          <form onSubmit={handleAddClass} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Add Classification</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newClassLabel}
                onChange={(e) => setNewClassLabel(e.target.value)}
                placeholder="e.g. JV Boys"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
              <input
                type="number"
                value={newClassSortOrder}
                onChange={(e) => setNewClassSortOrder(e.target.value)}
                placeholder="Order"
                className="w-20 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={newClassIsDoubles}
                onChange={(e) => setNewClassIsDoubles(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Doubles event
            </label>
            <button
              type="submit"
              disabled={createClassMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
            >
              {createClassMutation.isPending ? 'Adding…' : 'Add Classification'}
            </button>
          </form>
        </section>

        {/* Boat Models */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Boat Models</h2>

          {boatModelsQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ul className="space-y-2">
              {(boatModelsQuery.data?.models ?? []).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3"
                >
                  <span className="font-medium text-gray-900">{m.brand} {m.name}</span>
                  <button
                    onClick={() => deleteModelMutation.mutate(m.id)}
                    disabled={deleteModelMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-700 min-h-8 px-2"
                  >
                    Delete
                  </button>
                </li>
              ))}
              {(boatModelsQuery.data?.models ?? []).length === 0 && (
                <p className="text-gray-500 text-sm">No boat models yet.</p>
              )}
            </ul>
          )}

          {modelError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {modelError}
            </div>
          )}

          <form onSubmit={handleAddModel} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Add Boat Model</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newModelBrand}
                onChange={(e) => setNewModelBrand(e.target.value)}
                placeholder="Brand (e.g. Nelo)"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
              <input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="Model (e.g. 560)"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
            </div>
            <button
              type="submit"
              disabled={createModelMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
            >
              {createModelMutation.isPending ? 'Adding…' : 'Add Boat Model'}
            </button>
          </form>
        </section>

        {/* Race Day Templates */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Race Day Templates</h2>
            {!showAddTemplate && (
              <button
                onClick={() => setShowAddTemplate(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-2.5 text-sm min-h-11 transition-colors"
              >
                + Add Template
              </button>
            )}
          </div>

          {templatesQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ul className="space-y-2">
              {(templatesQuery.data?.templates ?? []).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.races.length} race{t.races.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={() => deleteTemplateMutation.mutate(t.id)}
                    disabled={deleteTemplateMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-700 min-h-8 px-2"
                  >
                    Delete
                  </button>
                </li>
              ))}
              {(templatesQuery.data?.templates ?? []).length === 0 && (
                <p className="text-gray-500 text-sm">No templates yet.</p>
              )}
            </ul>
          )}

          {templateError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {templateError}
            </div>
          )}

          {showAddTemplate && (
            <form onSubmit={handleAddTemplate} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Add Template</h3>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-11"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createTemplateMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
                >
                  {createTemplateMutation.isPending ? 'Creating…' : 'Create Template'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddTemplate(false); setTemplateError(''); }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg px-4 py-3 text-sm min-h-11 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </Layout>
  );
}
