export interface HeatResultEntry {
  entryId: string;
  heatNumber: number;
  place: number;
  timeMs: number;
}

export type AdvancementRule =
  | { type: 'top_n_per_heat_plus_fastest'; top_n_per_heat: number; additional_fastest: number }
  | { type: 'top_overall'; count: number };

/**
 * Select the entry IDs that advance to the final, given all heat results
 * and an advancement rule.
 */
export function selectFinalists(
  results: HeatResultEntry[],
  rule: AdvancementRule
): string[] {
  if (rule.type === 'top_overall') {
    return results
      .slice()
      .sort((a, b) => a.timeMs - b.timeMs)
      .slice(0, rule.count)
      .map((r) => r.entryId);
  }

  // top_n_per_heat_plus_fastest
  const { top_n_per_heat, additional_fastest } = rule;
  const byHeat = new Map<number, HeatResultEntry[]>();
  for (const r of results) {
    const list = byHeat.get(r.heatNumber) ?? [];
    list.push(r);
    byHeat.set(r.heatNumber, list);
  }

  const advanced = new Set<string>();

  // Top N per heat
  for (const [, heatResults] of byHeat) {
    heatResults
      .slice()
      .sort((a, b) => a.place - b.place)
      .slice(0, top_n_per_heat)
      .forEach((r) => advanced.add(r.entryId));
  }

  // Additional fastest not already advanced
  if (additional_fastest > 0) {
    const remaining = results
      .filter((r) => !advanced.has(r.entryId))
      .slice()
      .sort((a, b) => a.timeMs - b.timeMs)
      .slice(0, additional_fastest);
    remaining.forEach((r) => advanced.add(r.entryId));
  }

  return [...advanced];
}
