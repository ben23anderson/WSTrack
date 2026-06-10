import { Router } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import db from '../lib/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { generateFinals } from '../lib/finalsGeneration.js';

/** @private */
async function isPrimaryOfficialOrCoordinator(
  userId: string,
  raceId: string
): Promise<boolean> {
  const race = await db.race.findUnique({
    where: { id: raceId },
    select: {
      raceDay: {
        select: {
          primaryOfficialId: true,
          divisionId: true,
        },
      },
    },
  });
  if (!race) return false;

  const coordinator = await db.membership.findFirst({
    where: { userId, role: 'coordinator', divisionId: race.raceDay.divisionId },
  });
  if (coordinator) return true;

  return race.raceDay.primaryOfficialId === userId;
}

/** @private */
async function isDivisionMember(userId: string, divisionId: string): Promise<boolean> {
  const membership = await db.membership.findFirst({
    where: {
      userId,
      OR: [{ divisionId }, { team: { divisionId } }],
    },
  });
  return !!membership;
}

export function createPublishRouter(io: SocketIOServer): Router {
  const router = Router({ mergeParams: true });

  // POST /api/races/:raceId/publish
  router.post('/publish', requireAuth, async (req, res): Promise<void> => {
    const { raceId } = req.params;
    const userId = req.session.userId!;
    try {
      if (!await isPrimaryOfficialOrCoordinator(userId, raceId)) {
        res.status(403).json({ error: 'Forbidden: primary official or coordinator only' });
        return;
      }

      const race = await db.race.findUnique({
        where: { id: raceId },
        select: {
          id: true,
          status: true,
          hasFinals: true,
          distanceId: true,
          raceDay: {
            select: {
              primaryOfficialId: true,
              divisionId: true,
            },
          },
        },
      });

      if (!race) {
        res.status(404).json({ error: 'Race not found' });
        return;
      }

      if (race.status === 'published') {
        res.status(409).json({ error: 'Race already published' });
        return;
      }

      // Check all submitted lineup entries have results in their heats
      const lineups = await db.lineup.findMany({
        where: { raceId, submitted: true },
        include: { entries: true },
      });

      const heats = await db.heat.findMany({
        where: { raceId },
        select: { id: true },
      });
      const heatIds = heats.map((h) => h.id);

      for (const lineup of lineups) {
        for (const entry of lineup.entries) {
          const resultExists = await db.result.findFirst({
            where: {
              entryId: entry.id,
              heatId: { in: heatIds },
            },
          });
          if (!resultExists) {
            res.status(422).json({
              error: `Entry ${entry.id} has no result in any heat`,
            });
            return;
          }
        }
      }

      // Load all results with athlete info for best time updates
      const allResults = await db.result.findMany({
        where: { heatId: { in: heatIds } },
        include: {
          entry: {
            include: {
              athlete: true,
              lineup: { select: { teamId: true } },
            },
          },
        },
      });

      const updatedRace = await db.$transaction(async (tx) => {
        const updated = await tx.race.update({
          where: { id: raceId },
          data: { status: 'published' },
        });

        if (race.hasFinals) {
          await generateFinals(raceId, tx);
        }

        // Update AthleteBestTime for each OK result
        for (const result of allResults) {
          if (result.status !== 'ok' || !result.timeMs) continue;
          const athleteId = result.entry?.athlete?.id;
          if (!athleteId) continue;

          const existing = await tx.athleteBestTime.findUnique({
            where: { athleteId_distanceId: { athleteId, distanceId: race.distanceId } },
          });

          if (!existing || result.timeMs < existing.timeMs) {
            await tx.athleteBestTime.upsert({
              where: { athleteId_distanceId: { athleteId, distanceId: race.distanceId } },
              update: { timeMs: result.timeMs, isOfficial: true },
              create: {
                athleteId,
                distanceId: race.distanceId,
                timeMs: result.timeMs,
                isOfficial: true,
              },
            });
          }
        }

        return updated;
      });

      io.to(`race:${raceId}`).emit('race:published', { raceId });

      res.json({ race: updatedRace, results: allResults });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/races/:raceId/results
  router.get('/results', requireAuth, async (req, res): Promise<void> => {
    const { raceId } = req.params;
    const userId = req.session.userId!;
    try {
      const race = await db.race.findUnique({
        where: { id: raceId },
        select: { raceDay: { select: { divisionId: true } } },
      });
      if (!race) {
        res.status(404).json({ error: 'Race not found' });
        return;
      }

      if (!await isDivisionMember(userId, race.raceDay.divisionId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const heats = await db.heat.findMany({
        where: { raceId },
        include: {
          results: {
            include: {
              entry: {
                include: {
                  athlete: true,
                  lineup: { include: { team: true } },
                },
              },
            },
            orderBy: { place: 'asc' },
          },
        },
        orderBy: { heatNumber: 'asc' },
      });

      const grouped = heats.map((heat) => ({
        heatNumber: heat.heatNumber,
        entries: heat.results.map((r) => ({
          place: r.place,
          timeMs: r.timeMs,
          status: r.status,
          athlete: r.entry.athlete,
          team: r.entry.lineup.team,
        })),
      }));

      res.json({ heats: grouped });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/races/:raceId/standings
  router.get('/standings', requireAuth, async (req, res): Promise<void> => {
    const { raceId } = req.params;
    const userId = req.session.userId!;
    try {
      const race = await db.race.findUnique({
        where: { id: raceId },
        select: {
          status: true,
          raceDay: { select: { divisionId: true } },
        },
      });
      if (!race) {
        res.status(404).json({ error: 'Race not found' });
        return;
      }

      if (!await isDivisionMember(userId, race.raceDay.divisionId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Check if there are published finals
      const publishedFinals = await db.final.findMany({
        where: { raceId },
        include: {
          results: {
            where: { isFinal: true },
            include: {
              entry: {
                include: {
                  athlete: true,
                  lineup: { include: { team: true } },
                },
              },
            },
          },
        },
      });

      const finalResults = publishedFinals.flatMap((f) => f.results);
      const finalistEntryIds = new Set(finalResults.map((r) => r.entryId));

      // Get heat results
      const heats = await db.heat.findMany({
        where: { raceId },
        select: { id: true },
      });
      const heatIds = heats.map((h) => h.id);

      const heatResults = await db.result.findMany({
        where: {
          heatId: { in: heatIds },
          entryId: { notIn: [...finalistEntryIds] },
        },
        include: {
          entry: {
            include: {
              athlete: true,
              lineup: { include: { team: true } },
            },
          },
        },
      });

      interface StandingEntry {
        place: number | null;
        entryId: string;
        athleteName: string;
        teamName: string;
        timeMs: number | null;
        status: string;
        source: 'final' | 'heat';
      }

      const standings: StandingEntry[] = [
        ...finalResults.map((r) => ({
          place: r.place,
          entryId: r.entryId,
          athleteName: r.entry.athlete.name,
          teamName: r.entry.lineup.team.name,
          timeMs: r.timeMs,
          status: r.status,
          source: 'final' as const,
        })),
        ...heatResults.map((r) => ({
          place: r.place,
          entryId: r.entryId,
          athleteName: r.entry.athlete.name,
          teamName: r.entry.lineup.team.name,
          timeMs: r.timeMs,
          status: r.status,
          source: 'heat' as const,
        })),
      ];

      standings.sort((a, b) => {
        if (a.place === null && b.place === null) return 0;
        if (a.place === null) return 1;
        if (b.place === null) return -1;
        return a.place - b.place;
      });

      res.json({ standings });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
