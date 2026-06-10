import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './socket.js';
import { sessionMiddleware } from './lib/sessionMiddleware.js';
import { createOfficiatingRouter } from './routes/officiating.js';
import { createReviewRouter } from './routes/review.js';
import { createPublishRouter } from './routes/publish.js';
import { createFinalOfficiatingRouter } from './routes/finalOfficiating.js';
import { createFinalReviewRouter } from './routes/finalReview.js';
import { config } from './config.js';

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server, sessionMiddleware);

// Mount routers that need io
app.use('/api/heats/:heatId', createOfficiatingRouter(io));
app.use('/api/heats/:heatId', createReviewRouter(io));
app.use('/api/races/:raceId', createPublishRouter(io));
app.use('/api/finals/:finalId', createFinalOfficiatingRouter(io));
app.use('/api/finals/:finalId', createFinalReviewRouter(io));

server.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT} [${config.NODE_ENV}]`);
});
