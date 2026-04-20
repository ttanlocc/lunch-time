// server/index.js  (path: /home/azureuser/aiq/lunch-time/server/index.js)
import express from 'express';
import cors from 'cors';
import { menuRouter } from './src/routes/menu.js';
import { ordersRouter } from './src/routes/orders.js';
import { debtsRouter } from './src/routes/debts.js';
import { eventsRouter } from './src/routes/events.js';
import { webhookRouter } from './src/routes/webhook.js';
import { startCron } from './src/cron.js';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/menu', menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/debts', debtsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/webhook', webhookRouter);

startCron();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`LunchTime API running on :${PORT}`));

export default app;
