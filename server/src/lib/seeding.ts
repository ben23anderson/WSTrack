export interface SeedEntry {
  entryId: string;
  teamId: string;
  timeMs: number | null;  // null = unseeded
}

export interface HeatAssignment {
  entryId: string;
  heatNumber: number;
  lane: number;
}

export interface SeedingOptions {
  strategy: 'snake' | 'random';
  balance_teams: boolean;
  lane_count: number;
  heat_count?: number; // computed if omitted
}

/**
 * Sort entries seed-first (ascending timeMs), unseeded last (randomized among themselves).
 * @private
 */
export function sortBySeed(entries: SeedEntry[]): SeedEntry[] {
  const seeded = entries.filter((e) => e.timeMs !== null).sort((a, b) => a.timeMs! - b.timeMs!);
  const unseeded = entries.filter((e) => e.timeMs === null).sort(() => Math.random() - 0.5);
  return [...seeded, ...unseeded];
}

/**
 * Build the center-out lane order for a given lane count.
 * Fastest entry gets the center lane; subsequent entries alternate outward.
 * For lane_count=8: order is [4, 5, 3, 6, 2, 7, 1, 8]
 * @private
 */
export function centerOutOrder(laneCount: number): number[] {
  const mid = Math.floor((laneCount + 1) / 2);
  const result: number[] = [mid];
  for (let offset = 1; result.length < laneCount; offset++) {
    if (mid + offset <= laneCount) result.push(mid + offset);
    if (result.length < laneCount && mid - offset >= 1) result.push(mid - offset);
  }
  return result;
}

/**
 * Distribute sorted entries into heats using snake (serpentine) pattern.
 * Returns a map from entryId → heatNumber (1-indexed).
 * Pattern: 1→H1, 2→H2, ... k→Hk, k+1→Hk, k+2→H(k-1), ..., 2k→H1, 2k+1→H1, ...
 * @private
 */
export function snakeDistribute(sorted: SeedEntry[], heatCount: number): Map<string, number> {
  const map = new Map<string, number>();
  let forward = true;
  let heatIdx = 0; // 0-based index into 1..heatCount
  for (const entry of sorted) {
    map.set(entry.entryId, heatIdx + 1);
    if (forward) {
      heatIdx++;
      if (heatIdx === heatCount) { heatIdx = heatCount - 1; forward = false; }
    } else {
      heatIdx--;
      if (heatIdx < 0) { heatIdx = 0; forward = true; }
    }
  }
  return map;
}

/**
 * Apply team-balance swaps: scan for heats with ≥2 entries from the same team
 * and try swapping with an adjacent-seeded entry in a different heat.
 * Only swaps when it strictly reduces the max same-team-per-heat count.
 * @private
 */
export function applyTeamBalance(
  sorted: SeedEntry[],
  heatMap: Map<string, number>
): Map<string, number> {
  const result = new Map(heatMap);

  /** Count max same-team entries in any single heat. */
  function maxStack(): number {
    const counts = new Map<string, number>(); // `${teamId}-${heat}` → count
    for (const [entryId, heat] of result) {
      const entry = sorted.find((e) => e.entryId === entryId)!;
      const key = `${entry.teamId}-${heat}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Math.max(0, ...counts.values());
  }

  const WINDOW = 3; // how many adjacent seeds to consider for swapping
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < Math.min(i + WINDOW + 1, sorted.length); j++) {
        const ei = sorted[i];
        const ej = sorted[j];
        if (result.get(ei.entryId) === result.get(ej.entryId)) continue; // same heat already
        // Try swap
        const hi = result.get(ei.entryId)!;
        const hj = result.get(ej.entryId)!;
        const before = maxStack();
        result.set(ei.entryId, hj);
        result.set(ej.entryId, hi);
        const after = maxStack();
        if (after < before) {
          improved = true; // keep swap
        } else {
          result.set(ei.entryId, hi); // revert
          result.set(ej.entryId, hj);
        }
      }
    }
  }
  return result;
}

/**
 * Assign lanes center-out within each heat based on seed order.
 * Fastest entry within the heat gets the center lane.
 * @private
 */
export function assignLanes(
  sorted: SeedEntry[],
  heatMap: Map<string, number>,
  heatCount: number,
  laneCount: number
): HeatAssignment[] {
  const laneOrder = centerOutOrder(laneCount);
  const assignments: HeatAssignment[] = [];

  for (let h = 1; h <= heatCount; h++) {
    // Entries in this heat, in seed order (sorted is already in seed order)
    const heatEntries = sorted.filter((e) => heatMap.get(e.entryId) === h);
    heatEntries.forEach((entry, posIdx) => {
      assignments.push({
        entryId: entry.entryId,
        heatNumber: h,
        lane: laneOrder[posIdx] ?? posIdx + 1,
      });
    });
  }
  return assignments;
}

/**
 * Main entry point: generate heat assignments from a list of entries.
 * Pluggable via `options.strategy`.
 */
export function generateHeatAssignments(
  entries: SeedEntry[],
  options: SeedingOptions
): HeatAssignment[] {
  if (entries.length === 0) return [];

  const heatCount = options.heat_count ?? Math.ceil(entries.length / options.lane_count);

  let sorted: SeedEntry[];
  if (options.strategy === 'random') {
    sorted = [...entries].sort(() => Math.random() - 0.5);
  } else {
    sorted = sortBySeed(entries);
  }

  let heatMap = snakeDistribute(sorted, heatCount);

  if (options.balance_teams) {
    heatMap = applyTeamBalance(sorted, heatMap);
  }

  return assignLanes(sorted, heatMap, heatCount, options.lane_count);
}
