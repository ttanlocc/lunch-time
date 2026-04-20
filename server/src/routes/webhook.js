// server/src/routes/webhook.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { broadcast } from '../services/sse.js';

export const webhookRouter = Router();

export function parseSePayContent(content) {
  if (!content) return null;
  const match = content.trim().match(/^lunch\s+tuan\s+(\d+)\s+(.+)$/i);
  if (!match) return null;
  const week = parseInt(match[1]);
  const personName = match[2].trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return { week, personName };
}

webhookRouter.post('/sepay', (req, res) => {
  const WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET && req.headers['x-sepay-secret'] !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { content, transferAmount, transactionDate, referenceCode } = req.body;

  const parsed = parseSePayContent(content || '');
  if (!parsed) return res.json({ success: false, reason: 'content_no_match' });

  const db = getDb();

  // Look up canonical name from orders to handle case mismatches
  const canonicalRow = db.prepare(
    `SELECT person_name FROM orders WHERE lower(person_name) = lower(?) ORDER BY created_at DESC LIMIT 1`
  ).get(parsed.personName);
  const canonicalName = canonicalRow?.person_name ?? parsed.personName;

  const year = transactionDate ? new Date(transactionDate).getFullYear() : new Date().getFullYear();

  db.prepare(`
    INSERT INTO payments (person_name, week_number, year, amount, status, sepay_ref, paid_at)
    VALUES (@person_name, @week_number, @year, @amount, 'paid', @sepay_ref, @paid_at)
    ON CONFLICT(person_name, week_number, year)
    DO UPDATE SET status='paid', sepay_ref=@sepay_ref, paid_at=@paid_at, amount=@amount
  `).run({
    person_name: canonicalName,
    week_number: parsed.week,
    year,
    amount: transferAmount || 0,
    sepay_ref: referenceCode || null,
    paid_at: transactionDate || new Date().toISOString(),
  });

  broadcast('payment_confirmed', {
    person_name: canonicalName,
    week: parsed.week,
    year,
    amount: transferAmount,
  });

  res.json({ success: true });
});
