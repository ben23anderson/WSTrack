import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import { config } from './config.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import divisionsRouter from './routes/divisions.js';
import teamsRouter from './routes/teams.js';
import membershipsRouter from './routes/memberships.js';
import invitesRouter from './routes/invites.js';
import { createStorageProvider } from './lib/storage/index.js';
import { createAthletesRouter } from './routes/athletes.js';
import { createBoatsRouter } from './routes/boats.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: config.NODE_ENV === 'production' ? false : 'http://localhost:5173',
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

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

  return app;
}
