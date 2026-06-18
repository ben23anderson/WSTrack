import { apiFetch } from './client.js';

export interface RaceDayTemplateRaceData {
  id: string;
  templateId: string;
  classificationId: string | null;
  distanceId: string | null;
  laneCount: number;
  hasFinals: boolean;
  orderIndex: number;
  classification: { id: string; label: string } | null;
  distance: { id: string; label: string } | null;
}

export interface RaceDayTemplateData {
  id: string;
  divisionId: string;
  name: string;
  races: RaceDayTemplateRaceData[];
}

export function listTemplates(divisionId: string): Promise<{ templates: RaceDayTemplateData[] }> {
  return apiFetch(`/divisions/${divisionId}/race-day-templates`);
}

export function createTemplate(divisionId: string, data: { name: string; races?: unknown[] }): Promise<{ template: RaceDayTemplateData }> {
  return apiFetch(`/divisions/${divisionId}/race-day-templates`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteTemplate(divisionId: string, templateId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/divisions/${divisionId}/race-day-templates/${templateId}`, { method: 'DELETE' });
}

export function addTemplateRace(
  divisionId: string,
  templateId: string,
  data: { classification_id?: string; distance_id?: string; lane_count?: number; has_finals?: boolean; order_index?: number }
): Promise<{ race: RaceDayTemplateRaceData }> {
  return apiFetch(`/divisions/${divisionId}/race-day-templates/${templateId}/races`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteTemplateRace(divisionId: string, templateId: string, raceId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/divisions/${divisionId}/race-day-templates/${templateId}/races/${raceId}`, { method: 'DELETE' });
}
