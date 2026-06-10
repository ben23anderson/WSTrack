import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { sessionMiddleware } from './lib/sessionMiddleware.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import divisionsRouter from './routes/divisions.js';
import teamsRouter from './routes/teams.js';
import membershipsRouter from './routes/memberships.js';
import invitesRouter from './routes/invites.js';
import { createStorageProvider } from './lib/storage/index.js';
import { createAthletesRouter } from './routes/athletes.js';
import { createBoatsRouter } from './routes/boats.js';
import configRouter from './routes/config.js';
import raceDaysRouter from './routes/raceDays.js';
import racesRouter from './routes/races.js';
import lineupsRouter from './routes/lineups.js';
import substitutionsRouter from './routes/substitutions.js';
import scratchesRouter from './routes/scratches.js';
import broughtBoatsRouter from './routes/broughtBoats.js';
import boatAssignmentsRouter from './routes/boatAssignments.js';
import boatLoansRouter from './routes/boatLoans.js';
import seedingRouter from './routes/seeding.js';
import finalsRouter from './routes/finals.js';

export function createApp(): express.Application {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({
    origin: config.NODE_ENV === 'production' ? false : 'http://localhost:5173',
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(sessionMiddleware);

  const storage = createStorageProvider();

  app.use('/uploads', express.static(config.UPLOAD_DIR));

  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/divisions', divisionsRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/teams/:teamId', membershipsRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/teams/:teamId/athletes', createAthletesRouter(storage));
  app.use('/api/teams/:teamId/boats', createBoatsRouter());

  app.use('/api/divisions/:divisionId', configRouter);
  app.use('/api/divisions/:divisionId/race-days', raceDaysRouter);
  app.use('/api/race-days/:raceDayId/races', racesRouter);
  app.use('/api/races/:raceId', lineupsRouter);
  app.use('/api/races/:raceId', substitutionsRouter);
  app.use('/api/races/:raceId', scratchesRouter);
  app.use('/api/race-days/:raceDayId/brought-boats', broughtBoatsRouter);
  app.use('/api/races/:raceId/boat-assignments', boatAssignmentsRouter);
  app.use('/api/races/:raceId/boat-loans', boatLoansRouter);
  app.use('/api/races/:raceId', seedingRouter);
  app.use('/api/races/:raceId', finalsRouter);

  // In production, serve the built React client from server/public
  if (config.NODE_ENV === 'production') {
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}
