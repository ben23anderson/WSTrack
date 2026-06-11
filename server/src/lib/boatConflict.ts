import db from './db.js';

export type ConflictLevel = 'none' | '2_heats' | '1_heat';

/**
 * Compute a global heat sequence index for each heat across a race day.
 * Races ordered by orderIndex; within each race, heats ordered by heatNumber.
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
 * For a race, find which heats each entry is assigned to (via LaneAssignment).
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
 * - '1_heat': boat used in a heat 1 position away in global heat sequence
 * - '2_heats': boat used in a heat 2 positions away
 * - 'none': safe to use
 *
 * Falls back to race-order proximity (2 prior races = 2_heats, 1 prior = 1_heat)
 * when heats have not yet been generated for the race day.
 */
export async function getBoatConflictLevels(
  raceId: string
): Promise<Map<string, ConflictLevel>> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true, orderIndex: true },
  });
  if (!race) return new Map();

  const allRaces = await db.race.findMany({
    where: { raceDayId: race.raceDayId },
    select: { id: true, orderIndex: true },
  });
  const allRaceIds = allRaces.map((r) => r.id);

  const allAssignments = await db.boatAssignment.findMany({
    where: { raceId: { in: allRaceIds } },
    select: { boatId: true, entryId: true, raceId: true },
  });

  const globalSeq = await getGlobalHeatSequence(race.raceDayId);
  const heatsExist = globalSeq.size > 0;

  if (heatsExist) {
    // ── Heat-level conflict detection ────────────────────────────────────────
    const raceEntryHeat = new Map<string, Map<string, string>>();
    for (const r of allRaces) {
      raceEntryHeat.set(r.id, await getEntryHeatMap(r.id));
    }

    // Current race: collect the global heat indices for heats in this race
    const currentEntryHeat = raceEntryHeat.get(raceId) ?? new Map<string, string>();
    const currentHeatIndices = new Set<number>();
    for (const heatId of currentEntryHeat.values()) {
      const idx = globalSeq.get(heatId);
      if (idx !== undefined) currentHeatIndices.add(idx);
    }

    const boatMinDistance = new Map<string, number>();
    for (const assignment of allAssignments) {
      if (assignment.raceId === raceId) continue;
      const entryHeatMap = raceEntryHeat.get(assignment.raceId) ?? new Map<string, string>();
      const heatId = entryHeatMap.get(assignment.entryId);
      if (!heatId) continue;
      const heatIdx = globalSeq.get(heatId);
      if (heatIdx === undefined) continue;
      let minDist = Infinity;
      for (const curIdx of currentHeatIndices) {
        minDist = Math.min(minDist, Math.abs(heatIdx - curIdx));
      }
      const existing = boatMinDistance.get(assignment.boatId) ?? Infinity;
      boatMinDistance.set(assignment.boatId, Math.min(existing, minDist));
    }

    const result = new Map<string, ConflictLevel>();
    for (const [boatId, dist] of boatMinDistance) {
      if (dist <= 1) result.set(boatId, '1_heat');
      else if (dist <= 2) result.set(boatId, '2_heats');
    }
    return result;
  } else {
    // ── Race-order fallback (no heats yet) ───────────────────────────────────
    const currentOrderIndex = race.orderIndex;
    const boatMinDistance = new Map<string, number>();

    for (const assignment of allAssignments) {
      if (assignment.raceId === raceId) continue;
      const otherRace = allRaces.find((r) => r.id === assignment.raceId);
      if (!otherRace) continue;
      const dist = Math.abs(otherRace.orderIndex - currentOrderIndex);
      const existing = boatMinDistance.get(assignment.boatId) ?? Infinity;
      boatMinDistance.set(assignment.boatId, Math.min(existing, dist));
    }

    const result = new Map<string, ConflictLevel>();
    for (const [boatId, dist] of boatMinDistance) {
      if (dist <= 1) result.set(boatId, '1_heat');
      else if (dist <= 2) result.set(boatId, '2_heats');
    }
    return result;
  }
}

/**
 * Returns available single (non-double) boats for a team in a race, with conflict levels.
 */
export async function getAvailableBoats(
  raceId: string,
  teamId: string
): Promise<{
  id: string;
  number: string;
  model: string | null;
  modelRank: number;
  numberRank: number;
  isLoaned: boolean;
  conflictLevel: ConflictLevel;
}[]> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true },
  });
  if (!race) return [];

  const conflictLevels = await getBoatConflictLevels(raceId);

  const ownBoats = await db.boat.findMany({
    where: {
      teamId,
      isDouble: false,
      deletedAt: null,
      raceDayBoats: { some: { raceDayId: race.raceDayId } },
    },
    orderBy: [{ modelRank: 'asc' }, { numberRank: 'asc' }],
  });

  const loans = await db.boatLoan.findMany({
    where: { raceId, toTeamId: teamId },
    include: { boat: true },
  });

  const result = [
    ...ownBoats.map((b) => ({
      id: b.id,
      number: b.number,
      model: b.model,
      modelRank: b.modelRank,
      numberRank: b.numberRank,
      isLoaned: false,
      conflictLevel: conflictLevels.get(b.id) ?? ('none' as ConflictLevel),
    })),
    ...loans.map((l) => ({
      id: l.boat.id,
      number: l.boat.number,
      model: l.boat.model,
      modelRank: l.boat.modelRank,
      numberRank: l.boat.numberRank,
      isLoaned: true,
      conflictLevel: conflictLevels.get(l.boat.id) ?? ('none' as ConflictLevel),
    })),
  ];

  result.sort((a, b) => a.modelRank - b.modelRank || a.numberRank - b.numberRank);
  return result;
}

/**
 * Auto-assign boats for a team's single-kayak entries in a race.
 * Prefers safe boats (none/2_heats) over 1_heat-conflicted boats.
 * Entries sorted fastest → slowest by best time.
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

  const lineup = await db.lineup.findUnique({
    where: { teamId_raceId: { teamId, raceId } },
    include: {
      entries: {
        include: {
          athlete: {
            include: { bestTimes: { where: { distanceId: race.distanceId } } },
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

  const unassigned = lineup.entries
    .filter((e) => !assignedEntryIds.has(e.id) && !e.pairId)
    .sort((a, b) => {
      const tA = a.athlete.bestTimes[0]?.timeMs ?? Infinity;
      const tB = b.athlete.bestTimes[0]?.timeMs ?? Infinity;
      return tA - tB;
    });

  const availableBoats = (await getAvailableBoats(raceId, teamId)).filter((b) => !b.isLoaned);

  // Prefer safe boats, then 1_heat-conflicted boats as last resort
  const safe = availableBoats.filter((b) => b.conflictLevel === 'none' || b.conflictLevel === '2_heats');
  const risky = availableBoats.filter((b) => b.conflictLevel === '1_heat');
  const sortedBoats = [...safe, ...risky];

  const assignments: { entryId: string; boatId: string; conflictLevel: ConflictLevel }[] = [];
  const usedBoatIds = new Set<string>();

  for (const entry of unassigned) {
    const boat = sortedBoats.find((b) => !usedBoatIds.has(b.id));
    if (!boat) break;
    usedBoatIds.add(boat.id);
    assignments.push({ entryId: entry.id, boatId: boat.id, conflictLevel: boat.conflictLevel });
  }

  return assignments;
}
