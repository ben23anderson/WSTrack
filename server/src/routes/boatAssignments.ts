import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { AssignBoatSchema, AutoAssignBoatsSchema } from '../lib/validation.js';
import type { AssistantPermissions } from '../lib/validation.js';
import { getConflictedBoatIds, getAvailableBoats, computeAutoAssignments } from '../lib/boatConflict.js';

const router = Router({ mergeParams: true });

/**
 * Check head_coach OR assistant_coach with boat_assignments permission on teamId.
 */
async function hasBoatAssignmentsAccess(userId: string, teamId: string): Promise<boolean> {
  const hc = await db.membership.findFirst({ where: { userId, role: 'head_coach', teamId } });
  if (hc) return true;
  const asst = await db.membership.findFirst({ where: { userId, role: 'assistant_coach', teamId } });
  if (!asst) return false;
  const perms = asst.permissions as AssistantPermissions | null;
  return perms?.boat_assignments === true;
}

// GET /api/races/:raceId/boat-assignments
// List all assignments for this race with hasConflict flag
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;

  try {
    // Verify race exists and check access
    const race = await db.race.findUnique({
      where: { id: raceId },
      select: { raceDayId: true, raceDay: { select: { divisionId: true } } },
    });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    // Check user is division member (team member or coordinator)
    const membership = await db.membership.findFirst({
      where: {
        userId,
        OR: [
          { divisionId: race.raceDay.divisionId },
          { team: { divisionId: race.raceDay.divisionId } },
        ],
      },
    });
    if (!membership) { res.status(403).json({ error: 'Forbidden' }); return; }

    const conflictedIds = await getConflictedBoatIds(raceId);

    const assignments = await db.boatAssignment.findMany({
      where: { raceId },
      include: {
        boat: { select: { id: true, number: true, model: true } },
        entry: {
          include: {
            athlete: { select: { id: true, name: true } },
            lineup: { select: { teamId: true } },
          },
        },
      },
    });

    const result = assignments.map((a) => ({
      id: a.id,
      raceId: a.raceId,
      entryId: a.entryId,
      boatId: a.boatId,
      isFinalAssignment: a.isFinalAssignment,
      hasConflict: conflictedIds.has(a.boatId),
      boat: a.boat,
      entry: {
        id: a.entry.id,
        lineupId: a.entry.lineupId,
        athleteId: a.entry.athleteId,
        pairId: a.entry.pairId,
        teamId: a.entry.lineup.teamId,
        athlete: a.entry.athlete,
      },
    }));

    res.json({ assignments: result });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/races/:raceId/boat-assignments/:entryId
// Assign/reassign boat to an entry
router.put('/:entryId', requireAuth, async (req, res): Promise<void> => {
  const { raceId, entryId } = req.params;
  const userId = req.session.userId!;

  const parsed = AssignBoatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { boat_id } = parsed.data;

  try {
    // Get the entry and its team
    const entry = await db.lineupEntry.findUnique({
      where: { id: entryId },
      include: { lineup: { select: { teamId: true, raceId: true } } },
    });
    if (!entry || entry.lineup.raceId !== raceId) {
      res.status(404).json({ error: 'Entry not found for this race' });
      return;
    }

    const teamId = entry.lineup.teamId;

    // Check permissions
    if (!await hasBoatAssignmentsAccess(userId, teamId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Check boat is available for this team in this race
    const available = await getAvailableBoats(raceId, teamId);
    const boatInfo = available.find((b) => b.id === boat_id);
    if (!boatInfo) {
      res.status(400).json({ error: 'Boat is not available for this team in this race' });
      return;
    }

    // Check boat not already assigned to another entry in this race
    const existingAssignment = await db.boatAssignment.findFirst({
      where: { raceId, boatId: boat_id, entryId: { not: entryId } },
    });
    if (existingAssignment) {
      res.status(409).json({ error: 'Boat is already assigned to another entry in this race' });
      return;
    }

    // Upsert the assignment
    const assignment = await db.boatAssignment.upsert({
      where: { raceId_entryId: { raceId, entryId } },
      update: { boatId: boat_id },
      create: { raceId, entryId, boatId: boat_id },
      include: {
        boat: { select: { id: true, number: true, model: true } },
        entry: {
          include: {
            athlete: { select: { id: true, name: true } },
            lineup: { select: { teamId: true } },
          },
        },
      },
    });

    res.json({
      assignment: {
        ...assignment,
        hasConflict: boatInfo.hasConflict,
        entry: {
          ...assignment.entry,
          teamId: assignment.entry.lineup.teamId,
        },
      },
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/races/:raceId/boat-assignments/:entryId
// Remove assignment
router.delete('/:entryId', requireAuth, async (req, res): Promise<void> => {
  const { raceId, entryId } = req.params;
  const userId = req.session.userId!;

  try {
    // Get the entry and its team
    const entry = await db.lineupEntry.findUnique({
      where: { id: entryId },
      include: { lineup: { select: { teamId: true, raceId: true } } },
    });
    if (!entry || entry.lineup.raceId !== raceId) {
      res.status(404).json({ error: 'Entry not found for this race' });
      return;
    }

    const teamId = entry.lineup.teamId;

    // Check permissions
    if (!await hasBoatAssignmentsAccess(userId, teamId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const assignment = await db.boatAssignment.findUnique({
      where: { raceId_entryId: { raceId, entryId } },
    });
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }

    await db.boatAssignment.delete({ where: { raceId_entryId: { raceId, entryId } } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/boat-assignments/auto-assign
// Auto-assign boats for a team's singles in this race
router.post('/auto-assign', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;

  const bodyParsed = AutoAssignBoatsSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }

  const teamId = (req.body as { team_id?: string }).team_id;
  if (!teamId || typeof teamId !== 'string') {
    res.status(400).json({ error: 'team_id is required' });
    return;
  }

  try {
    // Check permissions (head_coach only for auto-assign)
    const hc = await db.membership.findFirst({ where: { userId, role: 'head_coach', teamId } });
    if (!hc) {
      res.status(403).json({ error: 'Forbidden: head coach only' });
      return;
    }

    // Verify race exists
    const race = await db.race.findUnique({ where: { id: raceId } });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    const proposed = await computeAutoAssignments(raceId, teamId);
    const { save } = bodyParsed.data;

    if (save && proposed.length > 0) {
      // Upsert each proposed assignment
      await Promise.all(
        proposed.map((p) =>
          db.boatAssignment.upsert({
            where: { raceId_entryId: { raceId, entryId: p.entryId } },
            update: { boatId: p.boatId },
            create: { raceId, entryId: p.entryId, boatId: p.boatId },
          })
        )
      );
    }

    res.json({ assignments: proposed, saved: save });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
