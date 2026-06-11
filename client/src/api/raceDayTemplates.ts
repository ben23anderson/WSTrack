import { apiFetch } from './client.js';

export interface TemplateRaceData {
  id: string;
  name: string;
  orderIndex: number;
  laneCount: number;
  hasFinals: boolean;
  classification: { id: string; label: string } | null;
  distance: { id: string; label: string } | null;
}

export interface RaceDayTemplateData {
  id: string;
  name: string;
  races: TemplateRaceData[];
}

export function listTemplates(divisionId: string): Promise<{ templates: RaceDayTemplateData[] }> {
  return apiFetch(`/divisions/${divisionId}/race-day-templates`);
}

export function createTemplate(divisionId: string, data: {
  name: string;
  races: { name: string; classificationId?: string; distanceId?: string; laneCount?: number; hasFinals?: boolean; orderIndex?: number }[];
}): Promise<{ template: RaceDayTemplateData }> {
  return apiFetch(`/divisions/${divisionId}/race-day-templates`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteTemplate(divisionId: string, templateId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/divisions/${divisionId}/race-day-templates/${templateId}`, { method: 'DELETE' });
}
