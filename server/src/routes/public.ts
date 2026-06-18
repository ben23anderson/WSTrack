import { Router } from 'express';
import db from '../lib/db.js';

const router = Router();

// GET /api/public/race-days/:raceDayId
router.get('/race-days/:raceDayId', async (req, res): Promise<void> => {
  const { raceDayId } = req.params;
  try {
    const raceDay = await db.raceDay.findUnique({
      where: { id: raceDayId },
      include: {
        division: { select: { name: true, league: { select: { name: true } } } },
        races: {
          orderBy: { orderIndex: 'asc' },
          include: {
            classification: { select: { label: true } },
            distance: { select: { label: true } },
            heats: {
              orderBy: { heatNumber: 'asc' },
              include: {
                laneAssignments: {
                  include: {
                    entry: {
                      include: {
                        athlete: { select: { name: true } },
                        lineup: { include: { team: { select: { name: true } } } },
                      },
                    },
                  },
                  orderBy: { lane: 'asc' },
                },
                results: {
                  include: {
                    entry: {
                      include: {
                        athlete: { select: { name: true } },
                        lineup: { include: { team: { select: { name: true } } } },
                      },
                    },
                  },
                  orderBy: { place: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (!raceDay) { res.status(404).json({ error: 'Race day not found' }); return; }

    // Strip results from any race that hasn't been published yet
    const sanitized = {
      ...raceDay,
      races: raceDay.races.map((race) => ({
        ...race,
        heats: race.heats.map((heat) => ({
          ...heat,
          results: race.status === 'published' ? heat.results : [],
        })),
      })),
    };

    res.json({ raceDay: sanitized });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
