// server/src/cron.js
import cron from 'node-cron';
import { getDb } from './db/index.js';
import { broadcast } from './services/sse.js';

export function startCron() {
  cron.schedule('0 11 * * 1-5', () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('UPDATE daily_menu SET is_locked = 1 WHERE date = ?').run(today);
    broadcast('order_locked', { date: today, reason: 'auto' });
    console.log(`[cron] Orders locked for ${today}`);
  }, { timezone: 'Asia/Ho_Chi_Minh' });
}
