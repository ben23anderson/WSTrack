import db from './db.js';

export type ConflictLevel = 'none' | '2_heats' | '1_heat' | 'unavailable';

/**
 * Compute a global heat sequence index for each heat across a race day.
 * Races are ordered by orderIndex; within each race, heats are ordered by heatNumber.
 * Returns a map from heatId → global sequence index (0-based).
 */
async function getGlobalHeatSequence(raceDayId: string): Promise<Map<string, number>> {
  const races = await db.race.findMany({
    where: { raceDayId },
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      heats: { orderBy: { heatNumber: 'asc' }, select: { id: true } },
    },
  });
  const map = new Map<string, number>();
  let idx = 0;
  for (const race of races) {
    for (const heat of race.heats) {
      map.set(heat.id, idx++);
    }
  }
  return map;
}

/**
 * For a race, find which heats each team entry is assigned to (via LaneAssignment).
 * Returns a map from entryId → heatId.
 */
async function getEntryHeatMap(raceId: string): Promise<Map<string, string>> {
  const laneAssignments = await db.laneAssignment.findMany({
    where: { heatId: { not: null }, heat: { raceId } },
    select: { entryId: true, heatId: true },
  });
  const map = new Map<string, string>();
  for (const la of laneAssignments) {
    if (la.heatId) map.set(la.entryId, la.heatId);
  }
  return map;
}

/**
 * Returns conflict level for each boat relative to the given race.
 * - 'unavailable': boat not in brought list or deleted
 * - '1_heat': boat used in a heat 1 position away globally
 * - '2_heats': boat used in a heat 2 positions away globally
 * - 'none': all clear
 */
export async function getBoatConflictLevels(
  raceId: string
): Promise<Map<string, ConflictLevel>> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true },
  });
  if (!race) return new Map();

  const globalSeq = await getGlobalHeatSequence(race.raceDayId);

  // Get all boat assignments for the whole race day
  const allRaces = await db.race.findMany({
    where: { raceDayId: race.raceDayId },
    select: { id: true },
  });
  const allRaceIds = allRaces.map((r) => r.id);

  const allAssignments = await db.boatAssignment.findMany({
    where: { raceId: { in: allRaceIds } },
    select: { boatId: true, entryId: true, raceId: true },
  });

  // For each race, get the entry→heat map
  const raceEntryHeat = new Map<string, Map<string, string>>();
  for (const r of allRaces) {
    raceEntryHeat.set(r.id, await getEntryHeatMap(r.id));
  }

  // Current race: get the heat global indices used in this race
  const currentRaceEntryHeat = raceEntryHeat.get(raceId) ?? new Map<string, string>();
  const currentRaceHeatIndices = new Set<number>();
  for (const heatId of currentRaceEntryHeat.values()) {
    const idx = globalSeq.get(heatId);
    if (idx !== undefined) currentRaceHeatIndices.add(idx);
  }

  // For each boat used in OTHER races, compute minimum distance to current race heats
  const boatMinDistance = new Map<string, number>();
  for (const assignment of allAssignments) {
    if (assignment.raceId === raceId) continue;
    const entryHeatMap = raceEntryHeat.get(assignment.raceId) ?? new Map<string, string>();
    const heatId = entryHeatMap.get(assignment.entryId);
    if (!heatId) continue;
    const heatIdx = globalSeq.get(heatId);
    if (heatIdx === undefined) continue;
    // Find minimum distance to any heat in the current race
    let minDist = Infinity;
    for (const curIdx of currentRaceHeatIndices) {
      minDist = Math.min(minDist, Math.abs(heatIdx - curIdx));
    }
    const existing = boatMinDistance.get(assignment.boatId) ?? Infinity;
    boatMinDistance.set(assignment.boatId, Math.min(existing, minDist));
  }

  // Build result map
  const result = new Map<string, ConflictLevel>();
  for (const [boatId, dist] of boatMinDistance) {
    if (dist <= 1) result.set(boatId, '1_heat');
    else if (dist <= 2) result.set(boatId, '2_heats');
  }
  return result;
}

/**
 * Returns available single (non-double) boats for a team in a race:
 * - Own boats that are marked as brought to the race day AND not deleted
 * - Plus loaned boats (BoatLoan where toTeamId = teamId AND raceId = raceId)
 * Sorted by model then number.
 */
export async function getAvailableBoats(
  raceId: string,
  teamId: string
): Promise<{ id: string; number: string; boatModelId: string | null; boatModelLabel: string | null; isLoaned: boolean; conflictLevel: ConflictLevel }[]> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true },
  });
  if (!race) return [];

  const conflictLevels = await getBoatConflictLevels(raceId);

  // Own boats: brought to race day, not double, not deleted
  const ownBoats = await db.boat.findMany({
    where: {
      teamId,
      isDouble: false,
      deletedAt: null,
      raceDayBoats: {
        some: { raceDayId: race.raceDayId },
      },
    },
    include: { boatModel: true },
    orderBy: [{ boatModelId: 'asc' }, { number: 'asc' }],
  });

  // Loaned boats for this race
  const loans = await db.boatLoan.findMany({
    where: { raceId, toTeamId: teamId },
    include: { boat: { include: { boatModel: true } } },
  });

  const result = [
    ...ownBoats.map((b) => ({
      id: b.id,
      number: b.number,
      boatModelId: b.boatModelId,
      boatModelLabel: b.boatModel ? `${b.boatModel.brand} ${b.boatModel.name}` : null,
      isLoaned: false,
      conflictLevel: conflictLevels.get(b.id) ?? ('none' as ConflictLevel),
    })),
    ...loans.map((l) => ({
      id: l.boat.id,
      number: l.boat.number,
      boatModelId: l.boat.boatModelId,
      boatModelLabel: l.boat.boatModel ? `${l.boat.boatModel.brand} ${l.boat.boatModel.name}` : null,
      isLoaned: true,
      conflictLevel: conflictLevels.get(l.boat.id) ?? ('none' as ConflictLevel),
    })),
  ];

  result.sort((a, b) => (a.boatModelLabel ?? '').localeCompare(b.boatModelLabel ?? '') || a.number.localeCompare(b.number));
  return result;
}

/**
 * Returns whether an athlete's preferences match a given boat
 * (by exact number or by model).
 */
function prefersBoat(
  prefs: { preferredBoatNumber: string | null; preferredBoatModelId: string | null },
  boat: { number: string; boatModelId: string | null }
): boolean {
  if (prefs.preferredBoatNumber && prefs.preferredBoatNumber === boat.number) return true;
  if (prefs.preferredBoatModelId && prefs.preferredBoatModelId === boat.boatModelId) return true;
  return false;
}

/** Lower = higher priority (0 = exact number, 1 = model, 2 = none). */
function prefPriority(
  prefs: { preferredBoatNumber: string | null; preferredBoatModelId: string | null },
  boat: { number: string; boatModelId: string | null }
): number {
  if (prefs.preferredBoatNumber && prefs.preferredBoatNumber === boat.number) return 0;
  if (prefs.preferredBoatModelId && prefs.preferredBoatModelId === boat.boatModelId) return 1;
  return 2;
}

/**
 * Auto-assign boats for a team's single-kayak entries in a race.
 *
 * Rules:
 * - Requires heats to exist; returns [] immediately if none.
 * - Iterates entries fastest → slowest.
 * - Prefers safe boats (none / 2_heats conflict); within safe boats
 *   preference order is exact-number > model > any.
 * - A 1_heat-conflicted boat is only assigned when BOTH the current
 *   athlete AND the athlete who has it in the conflicting race prefer it.
 *   The faster athlete wins (guaranteed by fastest-first iteration).
 *   The assignment is still flagged via conflictLevel='1_heat'.
 * - Unavailable boats (0-heat gap) are never assigned.
 */
export async function computeAutoAssignments(
  raceId: string,
  teamId: string
): Promise<{ entryId: string; boatId: string; conflictLevel: ConflictLevel }[]> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true, distanceId: true },
  });
  if (!race) return [];

  // Heats must exist before auto-assign can reason about gaps
  const heatCount = await db.heat.count({ where: { raceId } });
  if (heatCount === 0) return [];

  const lineup = await db.lineup.findUnique({
    where: { teamId_raceId: { teamId, raceId } },
    include: {
      entries: {
        include: {
          athlete: {
            select: {
              id: true,
              name: true,
              preferredBoatModelId: true,
              preferredBoatNumber: true,
              bestTimes: { where: { distanceId: race.distanceId } },
            },
          },
        },
      },
    },
  });
  if (!lineup) return [];

  const existingAssignments = await db.boatAssignment.findMany({
    where: { raceId, entry: { lineupId: lineup.id } },
    select: { entryId: true },
  });
  const assignedEntryIds = new Set(existingAssignments.map((a) => a.entryId));

  const unassignedEntries = lineup.entries
    .filter((e) => !assignedEntryIds.has(e.id) && !e.pairId)
    .sort((a, b) => {
      const tA = a.athlete.bestTimes[0]?.timeMs ?? Infinity;
      const tB = b.athlete.bestTimes[0]?.timeMs ?? Infinity;
      return tA - tB;
    });

  const availableBoats = (await getAvailableBoats(raceId, teamId)).filter((b) => !b.isLoaned);

  // Build map: boatId → other athletes' preferences (from OTHER races on this race day).
  // Used to enforce the mutual-preference rule for 1-heat conflicted boats.
  const allRaceIds = (await db.race.findMany({
    where: { raceDayId: race.raceDayId },
    select: { id: true },
  })).map((r) => r.id);

  const otherAssignments = await db.boatAssignment.findMany({
    where: { raceId: { in: allRaceIds.filter((id) => id !== raceId) } },
    select: {
      boatId: true,
      entry: {
        select: {
          athlete: {
            select: { preferredBoatNumber: true, preferredBoatModelId: true },
          },
        },
      },
    },
  });

  const otherAthletePrefs = new Map<
    string,
    { preferredBoatNumber: string | null; preferredBoatModelId: string | null }[]
  >();
  for (const a of otherAssignments) {
    const list = otherAthletePrefs.get(a.boatId) ?? [];
    list.push({
      preferredBoatNumber: a.entry.athlete.preferredBoatNumber,
      preferredBoatModelId: a.entry.athlete.preferredBoatModelId,
    });
    otherAthletePrefs.set(a.boatId, list);
  }

  const conflictOrder = (cl: ConflictLevel) =>
    cl === 'none' ? 0 : cl === '2_heats' ? 1 : cl === '1_heat' ? 2 : 3;

  const assignments: { entryId: string; boatId: string; conflictLevel: ConflictLevel }[] = [];
  const usedBoatIds = new Set<string>();

  for (const entry of unassignedEntries) {
    const athletePrefs = {
      preferredBoatNumber: entry.athlete.preferredBoatNumber,
      preferredBoatModelId: entry.athlete.preferredBoatModelId,
    };

    const remaining = availableBoats.filter((b) => !usedBoatIds.has(b.id));
    if (remaining.length === 0) break;

    // ── Tier 1: safe boats (none or 2_heats gap) ──────────────────────────
    const safeBoats = remaining.filter(
      (b) => b.conflictLevel === 'none' || b.conflictLevel === '2_heats'
    );

    if (safeBoats.length > 0) {
      const sorted = [...safeBoats].sort((a, b) => {
        const pa = prefPriority(athletePrefs, a);
        const pb = prefPriority(athletePrefs, b);
        if (pa !== pb) return pa - pb;
        return conflictOrder(a.conflictLevel) - conflictOrder(b.conflictLevel);
      });
      const boat = sorted[0];
      usedBoatIds.add(boat.id);
      assignments.push({ entryId: entry.id, boatId: boat.id, conflictLevel: boat.conflictLevel });
      continue;
    }

    // ── Tier 2: 1_heat conflicted boats — only if BOTH athletes prefer it ─
    const oneHeatBoats = remaining.filter((b) => b.conflictLevel === '1_heat');
    const eligible = oneHeatBoats.filter((boat) => {
      if (!prefersBoat(athletePrefs, boat)) return false;
      const others = otherAthletePrefs.get(boat.id) ?? [];
      return others.some((other) => prefersBoat(other, boat));
    });

    if (eligible.length > 0) {
      const sorted = [...eligible].sort(
        (a, b) => prefPriority(athletePrefs, a) - prefPriority(athletePrefs, b)
      );
      const boat = sorted[0];
      usedBoatIds.add(boat.id);
      // conflictLevel '1_heat' on the result serves as the visible flag
      assignments.push({ entryId: entry.id, boatId: boat.id, conflictLevel: boat.conflictLevel });
    }
    // unavailable boats (0-heat gap) are never assigned; leave entry unassigned
  }

  return assignments;
}
