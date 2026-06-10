import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './socket.js';
import { sessionMiddleware } from './lib/sessionMiddleware.js';
import { createOfficiatingRouter } from './routes/officiating.js';
import { config } from './config.js';

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server, sessionMiddleware);

// Mount officiating router after io is available
app.use('/api/heats/:heatId', createOfficiatingRouter(io));

server.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT} [${config.NODE_ENV}]`);
});
