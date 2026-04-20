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
  const { content, transferAmount, transactionDate, referenceCode } = req.body;

  const parsed = parseSePayContent(content || '');
  if (!parsed) return res.json({ success: false, reason: 'content_no_match' });

  const db = getDb();
  const year = transactionDate ? new Date(transactionDate).getFullYear() : new Date().getFullYear();

  db.prepare(`
    INSERT INTO payments (person_name, week_number, year, amount, status, sepay_ref, paid_at)
    VALUES (@person_name, @week_number, @year, @amount, 'paid', @sepay_ref, @paid_at)
    ON CONFLICT(person_name, week_number, year)
    DO UPDATE SET status='paid', sepay_ref=@sepay_ref, paid_at=@paid_at, amount=@amount
  `).run({
    person_name: parsed.personName,
    week_number: parsed.week,
    year,
    amount: transferAmount || 0,
    sepay_ref: referenceCode || null,
    paid_at: transactionDate || new Date().toISOString(),
  });

  broadcast('payment_confirmed', {
    person_name: parsed.personName,
    week: parsed.week,
    year,
    amount: transferAmount,
  });

  res.json({ success: true });
});
