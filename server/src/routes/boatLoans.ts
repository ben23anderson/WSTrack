import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { CreateBoatLoanSchema } from '../lib/validation.js';

const router = Router({ mergeParams: true });

async function getNextRaceId(raceId: string): Promise<string | null> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: { raceDayId: true, orderIndex: true },
  });
  if (!race) return null;
  const next = await db.race.findFirst({
    where: { raceDayId: race.raceDayId, orderIndex: { gt: race.orderIndex } },
    orderBy: { orderIndex: 'asc' },
    select: { id: true },
  });
  return next?.id ?? null;
}

// GET /api/races/:raceId/boat-loans
// List loans for this race
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;

  try {
    const race = await db.race.findUnique({
      where: { id: raceId },
      select: { raceDayId: true, raceDay: { select: { divisionId: true } } },
    });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    // Check user is division member
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

    const loans = await db.boatLoan.findMany({
      where: { raceId },
      include: {
        boat: { select: { id: true, number: true, model: true } },
        fromTeam: { select: { id: true, name: true } },
        toTeam: { select: { id: true, name: true } },
      },
    });

    res.json({ loans });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/races/:raceId/boat-loans
// Create a boat loan
router.post('/', requireAuth, async (req, res): Promise<void> => {
  const { raceId } = req.params;
  const userId = req.session.userId!;

  const parsed = CreateBoatLoanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  const { boat_id, to_team_id } = parsed.data;

  try {
    // Verify race exists
    const race = await db.race.findUnique({
      where: { id: raceId },
      select: { raceDayId: true },
    });
    if (!race) { res.status(404).json({ error: 'Race not found' }); return; }

    // Verify boat exists
    const boat = await db.boat.findFirst({
      where: { id: boat_id, deletedAt: null },
    });
    if (!boat) { res.status(404).json({ error: 'Boat not found' }); return; }

    // Check permissions: must be head_coach of the boat's team (from-team)
    const fromTeamId = boat.teamId;
    const hc = await db.membership.findFirst({
      where: { userId, role: 'head_coach', teamId: fromTeamId },
    });
    if (!hc) {
      res.status(403).json({ error: 'Forbidden: head coach of the boat\'s team required' });
      return;
    }

    // Validate: boat belongs to from-team (already confirmed via boat.teamId)
    // Validate: boat is NOT double
    if (boat.isDouble) {
      res.status(400).json({ error: 'Cannot loan a double (2-person) boat' });
      return;
    }

    // Validate: boat is brought to the race day
    const raceDayBoat = await db.raceDayBoat.findUnique({
      where: { raceDayId_boatId: { raceDayId: race.raceDayId, boatId: boat_id } },
    });
    if (!raceDayBoat) {
      res.status(400).json({ error: 'Boat is not marked as brought to this race day' });
      return;
    }

    // Validate: to_team exists
    const toTeam = await db.team.findFirst({ where: { id: to_team_id } });
    if (!toTeam) { res.status(404).json({ error: 'Receiving team not found' }); return; }

    // Enforce loan constraint: check next race
    const nextRaceId = await getNextRaceId(raceId);
    if (nextRaceId) {
      const nextRaceAssignment = await db.boatAssignment.findFirst({
        where: { raceId: nextRaceId, boatId: boat_id },
      });
      if (nextRaceAssignment) {
        res.status(409).json({
          error: 'Loaned boat cannot be used in the immediately following race',
        });
        return;
      }
    }

    // Create the loan
    const loan = await db.boatLoan.create({
      data: {
        boatId: boat_id,
        fromTeamId,
        toTeamId: to_team_id,
        raceId,
      },
      include: {
        boat: { select: { id: true, number: true, model: true } },
        fromTeam: { select: { id: true, name: true } },
        toTeam: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ loan });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/races/:raceId/boat-loans/:loanId
// Delete a loan
router.delete('/:loanId', requireAuth, async (req, res): Promise<void> => {
  const { raceId, loanId } = req.params;
  const userId = req.session.userId!;

  try {
    const loan = await db.boatLoan.findFirst({
      where: { id: loanId, raceId },
      include: { boat: true },
    });
    if (!loan) { res.status(404).json({ error: 'Loan not found' }); return; }

    // Check permissions: must be head_coach of the from-team
    const hc = await db.membership.findFirst({
      where: { userId, role: 'head_coach', teamId: loan.fromTeamId },
    });
    if (!hc) {
      res.status(403).json({ error: 'Forbidden: head coach of the from-team required' });
      return;
    }

    await db.boatLoan.delete({ where: { id: loanId } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
