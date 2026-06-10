export interface TapeEvent {
  entryId: string;
  timeMsFromStart: number;  // clientFinishTs - startTs (already converted from BigInt)
  sequence: number;
}

export interface Tape {
  officialId: string;
  events: TapeEvent[];  // sorted by sequence
}

export interface ReconciliationEntry {
  entryId: string;
  timeMs: number;
  place: number;
  status: 'ok' | 'review_needed';
  conflict_reason?: string;
}

/**
 * Reconcile multiple official tapes into a result set.
 * Rules:
 *   - If all tapes agree on ORDER and all times for each entry are within 1000ms → OK, use fastest time.
 *   - Otherwise → review_needed.
 * Entries not on any tape are excluded.
 * DNS/DQ entries (passed separately) override with their status.
 */
export function reconcileTapes(
  tapes: Tape[],
  dnsDqEntries: Map<string, 'dns' | 'dq'>
): ReconciliationEntry[] {
  if (tapes.length === 0) return [];

  // Gather all entry IDs that appear in at least one tape
  const allEntryIds = new Set<string>();
  for (const tape of tapes) {
    for (const ev of tape.events) allEntryIds.add(ev.entryId);
  }

  const results: ReconciliationEntry[] = [];

  for (const entryId of allEntryIds) {
    // Skip DNS/DQ — handled separately
    if (dnsDqEntries.has(entryId)) continue;

    // Times from all tapes that recorded this entry
    const timesPerTape = tapes
      .map((t) => t.events.find((e) => e.entryId === entryId)?.timeMsFromStart)
      .filter((t): t is number => t !== undefined);

    if (timesPerTape.length === 0) continue;

    const minTime = Math.min(...timesPerTape);
    const maxTime = Math.max(...timesPerTape);
    const timesAgree = maxTime - minTime <= 1000;

    results.push({
      entryId,
      timeMs: minTime,  // fastest time
      place: 0,  // assigned below
      status: timesAgree ? 'ok' : 'review_needed',
      conflict_reason: !timesAgree ? `Time spread ${maxTime - minTime}ms exceeds 1s` : undefined,
    });
  }

  // Check order agreement across tapes
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const entryA = results[i].entryId;
      const entryB = results[j].entryId;
      let aBeforeB = 0;
      let bBeforeA = 0;
      for (const tape of tapes) {
        const posA = tape.events.findIndex((e) => e.entryId === entryA);
        const posB = tape.events.findIndex((e) => e.entryId === entryB);
        if (posA === -1 || posB === -1) continue;
        if (posA < posB) aBeforeB++;
        else bBeforeA++;
      }
      if (aBeforeB > 0 && bBeforeA > 0) {
        results[i].status = 'review_needed';
        results[j].status = 'review_needed';
        const existing = results[i].conflict_reason ?? '';
        results[i].conflict_reason = (existing ? existing + '; ' : '') + `Order conflict with entry ${entryB}`;
      }
    }
  }

  // Sort by timeMs and assign places
  results.sort((a, b) => a.timeMs - b.timeMs);
  results.forEach((r, idx) => { r.place = idx + 1; });

  return results;
}
