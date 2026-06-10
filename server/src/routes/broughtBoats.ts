import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth, requireBoatInventoryAccess } from '../middleware/requireAuth.js';
import { MarkBoatBroughtSchema } from '../lib/validation.js';
import type { AssistantPermissions } from '../lib/validation.js';

const router = Router({ mergeParams: true });

/**
 * Check whether the user has boat_inventory access on the given team
 * (head_coach or assistant with boat_inventory perm).
 */
async function hasBoatInventoryAccess(userId: string, teamId: string): Promise<boolean> {
  const hc = await db.membership.findFirst({ where: { userId, role: 'head_coach', teamId } });
  if (hc) return true;
  const asst = await db.membership.findFirst({ where: { userId, role: 'assistant_coach', teamId } });
  if (!asst) return false;
  const perms = asst.permissions as AssistantPermissions | null;
  return perms?.boat_inventory === true;
}

// GET /api/race-days/:raceDayId/brought-boats
// Returns brought boats for the race day, filtered to the user's team(s)
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId } = req.params;
  const userId = req.session.userId!;
  try {
    // Find the race day to get its divisionId
    const raceDay = await db.raceDay.findUnique({
      where: { id: raceDayId },
      select: { divisionId: true },
    });
    if (!raceDay) { res.status(404).json({ error: 'Race day not found' }); return; }

    // Find teams the user has membership in within this division
    const memberships = await db.membership.findMany({
      where: {
        userId,
        team: { divisionId: raceDay.divisionId },
      },
      select: { teamId: true },
    });

    // Check if coordinator (sees all teams)
    const isCoordinator = await db.membership.findFirst({
      where: { userId, role: 'coordinator', divisionId: raceDay.divisionId },
    });

    const teamIds = memberships
      .map((m) => m.teamId)
      .filter((id): id is string => id !== null);

    const broughtBoats = await db.raceDayBoat.findMany({
      where: {
        raceDayId,
        ...(isCoordinator ? {} : { teamId: { in: teamIds } }),
      },
      include: {
        boat: true,
        team: { select: { id: true, name: true } },
      },
    });
    res.json({ broughtBoats });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/race-days/:raceDayId/brought-boats
// Mark a boat as being brought to this race day
router.post('/', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId } = req.params;
  const userId = req.session.userId!;

  const parsed = MarkBoatBroughtSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { boat_id } = parsed.data;

  try {
    // Verify boat exists and get its teamId
    const boat = await db.boat.findFirst({
      where: { id: boat_id, deletedAt: null },
    });
    if (!boat) { res.status(404).json({ error: 'Boat not found' }); return; }

    // Check access
    if (!await hasBoatInventoryAccess(userId, boat.teamId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    // Upsert the RaceDayBoat record
    const raceDayBoat = await db.raceDayBoat.upsert({
      where: { raceDayId_boatId: { raceDayId, boatId: boat_id } },
      update: {},
      create: { raceDayId, boatId: boat_id, teamId: boat.teamId },
      include: { boat: true, team: { select: { id: true, name: true } } },
    });
    res.status(201).json({ raceDayBoat });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/race-days/:raceDayId/brought-boats/:boatId
// Unmark a boat from this race day (blocks if assignments exist)
router.delete('/:boatId', requireAuth, async (req, res): Promise<void> => {
  const { raceDayId, boatId } = req.params;
  const userId = req.session.userId!;

  try {
    // Verify boat exists and get its teamId
    const boat = await db.boat.findFirst({
      where: { id: boatId, deletedAt: null },
    });
    if (!boat) { res.status(404).json({ error: 'Boat not found' }); return; }

    // Check access
    if (!await hasBoatInventoryAccess(userId, boat.teamId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    // Block if boat has assignments in any race on this race day
    const races = await db.race.findMany({
      where: { raceDayId },
      select: { id: true },
    });
    const raceIds = races.map((r) => r.id);

    if (raceIds.length > 0) {
      const existingAssignment = await db.boatAssignment.findFirst({
        where: { boatId, raceId: { in: raceIds } },
      });
      if (existingAssignment) {
        res.status(409).json({ error: 'Cannot remove: boat has assignments in races on this race day' });
        return;
      }
    }

    await db.raceDayBoat.delete({
      where: { raceDayId_boatId: { raceDayId, boatId } },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
