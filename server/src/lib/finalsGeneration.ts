import type { PrismaClient } from '@prisma/client';
import { selectFinalists } from './advancement.js';
import { generateHeatAssignments } from './seeding.js';
import type { SeedEntry } from './seeding.js';
import type { AdvancementRule } from './advancement.js';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Generate Final A (and optionally Final B) for a race.
 * Called inside the publish transaction (or with db directly for manual regeneration).
 */
export async function generateFinals(
  raceId: string,
  tx: TxClient
): Promise<void> {
  const race = await tx.race.findUnique({
    where: { id: raceId },
    select: {
      hasFinals: true,
      finalBEnabled: true,
      laneCount: true,
      distanceId: true,
      advancementRule: true,
      finalBRule: true,
    },
  });
  if (!race || !race.hasFinals) return;

  // Load all heat results for this race with ok status
  const heatResults = await tx.result.findMany({
    where: {
      heat: { raceId },
      status: 'ok',
      place: { not: null },
      timeMs: { not: null },
    },
    include: { heat: { select: { heatNumber: true } } },
  });

  if (heatResults.length === 0) return;

  const entryResults = heatResults.map((r) => ({
    entryId: r.entryId,
    heatNumber: r.heat!.heatNumber,
    place: r.place!,
    timeMs: r.timeMs!,
  }));

  const rule = race.advancementRule as AdvancementRule | null;
  if (!rule) return;

  // Generate Final A
  await createFinal(tx, raceId, 'A', entryResults, rule, race.laneCount, race.distanceId);

  // Generate Final B if enabled
  if (race.finalBEnabled && race.finalBRule) {
    const advancedToA = selectFinalists(entryResults, rule);
    const remainingResults = entryResults.filter((r) => !advancedToA.includes(r.entryId));
    if (remainingResults.length > 0) {
      const bRule = race.finalBRule as AdvancementRule;
      await createFinal(tx, raceId, 'B', remainingResults, bRule, race.laneCount, race.distanceId);
    }
  }
}

/** @private */
async function createFinal(
  tx: TxClient,
  raceId: string,
  type: 'A' | 'B',
  candidateResults: Array<{ entryId: string; heatNumber: number; place: number; timeMs: number }>,
  rule: AdvancementRule,
  laneCount: number,
  _distanceId: string
): Promise<void> {
  const finalistIds = selectFinalists(candidateResults, rule);
  if (finalistIds.length === 0) return;

  // Delete any existing final of this type (idempotent regeneration)
  const existing = await tx.final.findUnique({ where: { raceId_type: { raceId, type } } });
  if (existing) {
    await tx.laneAssignment.deleteMany({ where: { finalId: existing.id } });
    await tx.final.delete({ where: { id: existing.id } });
  }

  const final = await tx.final.create({ data: { raceId, type } });

  // Build seed entries for finalists: use their qualifying time as seed
  const seedEntries: SeedEntry[] = finalistIds.map((entryId) => {
    const result = candidateResults.find((r) => r.entryId === entryId);
    return {
      entryId,
      teamId: '', // not needed for finals seeding (no team balance for finals)
      timeMs: result?.timeMs ?? null,
    };
  });

  const assignments = generateHeatAssignments(seedEntries, {
    strategy: 'snake',
    balance_teams: false,
    lane_count: laneCount,
    heat_count: 1, // finals are always 1 heat
  });

  // Create LaneAssignment rows
  for (const a of assignments) {
    await tx.laneAssignment.create({
      data: { finalId: final.id, lane: a.lane, entryId: a.entryId },
    });
  }
}
