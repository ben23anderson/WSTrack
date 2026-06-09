import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './socket.js';
import { config } from './config.js';

const app = createApp();
const server = http.createServer(app);
const io = createSocketServer(server);

// Make io accessible in request handlers if needed
app.set('io', io);

server.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT} [${config.NODE_ENV}]`);
});
