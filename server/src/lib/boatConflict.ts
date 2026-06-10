import db from './db.js';

/**
 * Returns the IDs of races immediately prior to raceId within the same race day,
 * up to 2 races back (by order_index).
 * @private
 */
export async function getPriorRaceIds(raceId: string): Promise<string[]> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { orderIndex: true, raceDayId: true },
  });
  if (!race) return [];

  const priorRaces = await db.race.findMany({
    where: {
      raceDayId: race.raceDayId,
      orderIndex: { lt: race.orderIndex },
    },
    orderBy: { orderIndex: 'desc' },
    take: 2,
    select: { id: true },
  });
  return priorRaces.map((r) => r.id);
}

/**
 * Returns the ID of the race immediately following raceId within the same race day
 * (by order_index), or null if there is none.
 * @private
 */
export async function getNextRaceId(raceId: string): Promise<string | null> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { orderIndex: true, raceDayId: true },
  });
  if (!race) return null;

  const nextRace = await db.race.findFirst({
    where: {
      raceDayId: race.raceDayId,
      orderIndex: { gt: race.orderIndex },
    },
    orderBy: { orderIndex: 'asc' },
    select: { id: true },
  });
  return nextRace?.id ?? null;
}

/**
 * Returns the set of boat IDs that have a conflict for the given race
 * (i.e., they appear in a BoatAssignment for one of the two prior races).
 */
export async function getConflictedBoatIds(raceId: string): Promise<Set<string>> {
  const priorIds = await getPriorRaceIds(raceId);
  if (priorIds.length === 0) return new Set();

  const assignments = await db.boatAssignment.findMany({
    where: { raceId: { in: priorIds } },
    select: { boatId: true },
  });
  return new Set(assignments.map((a) => a.boatId));
}

/**
 * Returns available single (non-double) boats for a team in a race:
 * - Own boats that are marked as brought to the race day AND not deleted
 * - Plus loaned boats (BoatLoan where toTeamId = teamId AND raceId = raceId)
 * - Loaned boats are NOT eligible for auto-assign (flagged separately)
 * Sorted by (modelRank, numberRank).
 */
export async function getAvailableBoats(
  raceId: string,
  teamId: string
): Promise<{ id: string; number: string; model: string | null; modelRank: number; numberRank: number; isLoaned: boolean; hasConflict: boolean }[]> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true },
  });
  if (!race) return [];

  const conflictedIds = await getConflictedBoatIds(raceId);

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
    orderBy: [{ modelRank: 'asc' }, { numberRank: 'asc' }],
  });

  // Loaned boats for this race
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
      hasConflict: conflictedIds.has(b.id),
    })),
    ...loans.map((l) => ({
      id: l.boat.id,
      number: l.boat.number,
      model: l.boat.model,
      modelRank: l.boat.modelRank,
      numberRank: l.boat.numberRank,
      isLoaned: true,
      hasConflict: conflictedIds.has(l.boat.id),
    })),
  ];

  // Sort: (modelRank, numberRank)
  result.sort((a, b) => a.modelRank - b.modelRank || a.numberRank - b.numberRank);
  return result;
}

/**
 * Auto-assign boats for a team's single-kayak entries in a race.
 * Strategy: sort entries by their best time at the race's distance (null = last),
 * sort eligible (non-loaned) boats by (modelRank, numberRank),
 * greedily assign best boat to best entry while minimizing conflicts.
 * Returns the proposed list of { entryId, boatId, hasConflict }.
 */
export async function computeAutoAssignments(
  raceId: string,
  teamId: string
): Promise<{ entryId: string; boatId: string; hasConflict: boolean }[]> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true, distanceId: true },
  });
  if (!race) return [];

  // Get this team's lineup entries for this race that are NOT doubles
  const lineup = await db.lineup.findUnique({
    where: { teamId_raceId: { teamId, raceId } },
    include: {
      entries: {
        include: {
          athlete: {
            include: {
              bestTimes: {
                where: { distanceId: race.distanceId },
              },
            },
          },
        },
      },
    },
  });
  if (!lineup) return [];

  // Exclude entries that already have a boat assignment
  const existingAssignments = await db.boatAssignment.findMany({
    where: { raceId, entry: { lineupId: lineup.id } },
    select: { entryId: true },
  });
  const assignedEntryIds = new Set(existingAssignments.map((a) => a.entryId));

  // Only single entries (pairId = null means they're not part of a doubles pair)
  const unassignedEntries = lineup.entries.filter(
    (e) => !assignedEntryIds.has(e.id) && !e.pairId
  );

  // Sort entries: those with a best time first (ascending), then no-time entries
  unassignedEntries.sort((a, b) => {
    const tA = a.athlete.bestTimes[0]?.timeMs ?? Infinity;
    const tB = b.athlete.bestTimes[0]?.timeMs ?? Infinity;
    return tA - tB;
  });

  // Get available non-loaned single boats
  const availableBoats = (await getAvailableBoats(raceId, teamId)).filter(
    (b) => !b.isLoaned
  );

  // Greedy assignment: prefer non-conflicted boats
  const nonConflicted = availableBoats.filter((b) => !b.hasConflict);
  const conflicted = availableBoats.filter((b) => b.hasConflict);
  const sortedBoats = [...nonConflicted, ...conflicted];

  const assignments: { entryId: string; boatId: string; hasConflict: boolean }[] = [];
  const usedBoatIds = new Set<string>();

  for (const entry of unassignedEntries) {
    const boat = sortedBoats.find((b) => !usedBoatIds.has(b.id));
    if (!boat) break;
    usedBoatIds.add(boat.id);
    assignments.push({ entryId: entry.id, boatId: boat.id, hasConflict: boat.hasConflict });
  }

  return assignments;
}
