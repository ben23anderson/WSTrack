import { Router } from 'express';
import db from '../lib/db.js';
import { requireAuth, requireSystemAdmin } from '../middleware/requireAuth.js';
import { CreateLeagueSchema } from '../lib/validation.js';

const router = Router();

// GET /api/admin/leagues — list all leagues with divisions
router.get('/leagues', requireAuth, requireSystemAdmin, async (req, res): Promise<void> => {
  try {
    const leagues = await db.league.findMany({
      include: {
        divisions: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ leagues });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/leagues — create league + division (system admin only)
router.post('/leagues', requireAuth, requireSystemAdmin, async (req, res): Promise<void> => {
  const parsed = CreateLeagueSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' }); return; }
  const { leagueName, divisionName } = parsed.data;
  try {
    const result = await db.$transaction(async (tx) => {
      const league = await tx.league.create({ data: { name: leagueName } });
      const division = await tx.division.create({ data: { name: divisionName, leagueId: league.id } });
      return { league, division };
    });
    res.status(201).json({ league: result.league, division: result.division });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users?email=... — find user by email
router.get('/users', requireAuth, requireSystemAdmin, async (req, res): Promise<void> => {
  const email = (req.query.email as string ?? '').trim().toLowerCase();
  if (!email) { res.status(400).json({ error: 'email query param required' }); return; }
  try {
    const user = await db.user.findFirst({
      where: { email: { contains: email } },
      select: { id: true, name: true, email: true },
    });
    res.json({ user: user ?? null });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/divisions/:divisionId/coordinators — assign user as coordinator
router.post('/divisions/:divisionId/coordinators', requireAuth, requireSystemAdmin, async (req, res): Promise<void> => {
  const { divisionId } = req.params;
  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const division = await db.division.findUnique({ where: { id: divisionId } });
    if (!division) { res.status(404).json({ error: 'Division not found' }); return; }
    // Check if already exists
    const existing = await db.membership.findFirst({ where: { userId, role: 'coordinator', divisionId } });
    if (existing) { res.json({ membership: existing }); return; }
    const membership = await db.membership.create({ data: { userId, role: 'coordinator', divisionId } });
    res.status(201).json({ membership });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
