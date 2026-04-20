// server/src/routes/events.js
import { Router } from 'express';
import { addClient, removeClient } from '../services/sse.js';

export const eventsRouter = Router();

eventsRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('event: ping\ndata: {}\n\n');
  addClient(res);
  req.on('close', () => removeClient(res));
});
