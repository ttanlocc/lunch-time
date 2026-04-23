// server/src/routes/webhook.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { broadcast } from '../services/sse.js';
import { getWeekNumber } from '../services/debtCalculator.js';
import { parseQrCode, levenshtein, extractSenderName } from '../services/qrCode.js';

export const webhookRouter = Router();

export function parseSePayContent(content) {
  if (!content) return null;
  // Pattern 1: "Lunch Tuan 16 Khoa" — pay specific week
  // Stop name at first non-letter/space char (e.g. "." appended by bank)
  const weekMatch = content.match(/lunch\s+tuan\s+(\d+)\s+([a-zA-ZÀ-ỹ]+(?:\s+[a-zA-ZÀ-ỹ]+)*)/i);
  if (weekMatch) {
    const week = parseInt(weekMatch[1]);
    const personName = weekMatch[2].trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return { week, personName };
  }
  // Pattern 2: "Lunch Khoa" — pay all unpaid weeks
  // Stop at first non-letter/space char so banks appending ".CT tu..." don't break matching
  const allMatch = content.match(/lunch\s+([a-zA-ZÀ-ỹ]+(?:\s+[a-zA-ZÀ-ỹ]+)*)/i);
  if (allMatch) {
    const personName = allMatch[1].trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return { week: null, personName };
  }
  return null;
}

function resolveCanonicalName(db, parsedName) {
  if (!parsedName) return null;

  const exact = db.prepare(
    `SELECT person_name FROM orders WHERE lower(person_name) = lower(?) ORDER BY created_at DESC LIMIT 1`
  ).get(parsedName);
  if (exact) return exact.person_name;

  const allNames = db.prepare(`SELECT DISTINCT person_name FROM orders`).all().map(r => r.person_name);

  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const normParsed = norm(parsedName);
  const accentMatch = allNames.find(n => norm(n) === normParsed);
  if (accentMatch) return accentMatch;

  const fuzzy = allNames.find(n => levenshtein(normParsed, norm(n)) <= 2);
  if (fuzzy) return fuzzy;

  return null;
}

function getUnpaidWeeks(db, personName) {
  const orders = db.prepare(`
    SELECT o.date,
           mi.price + COALESCE(SUM(ma.price), 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    WHERE lower(o.person_name) = lower(?)
    GROUP BY o.id
  `).all(personName);

  const exclusions = db.prepare(
    `SELECT date FROM day_exclusions WHERE lower(person_name) = lower(?)`
  ).all(personName);
  const excludedDates = new Set(exclusions.map(e => e.date));

  const weekMap = {};
  for (const o of orders) {
    if (excludedDates.has(o.date)) continue;
    const week = getWeekNumber(o.date);
    const year = new Date(o.date).getFullYear();
    const key = `${week}|${year}`;
    if (!weekMap[key]) weekMap[key] = { week, year, amount: 0 };
    weekMap[key].amount += o.total_price;
  }

  const payments = db.prepare(
    `SELECT week_number, year FROM payments WHERE lower(person_name) = lower(?) AND status = 'paid'`
  ).all(personName);
  const paidSet = new Set(payments.map(p => `${p.week_number}|${p.year}`));

  return Object.values(weekMap).filter(w => w.amount > 0 && !paidSet.has(`${w.week}|${w.year}`));
}

function logWebhookEvent(db, { sepayId, rawContent, transferAmount, sepayRef }) {
  return db.prepare(`
    INSERT INTO webhook_events (sepay_id, raw_content, transfer_amount, sepay_ref, status)
    VALUES (?, ?, ?, ?, 'queued')
  `).run(sepayId ?? null, rawContent ?? null, transferAmount ?? 0, sepayRef ?? null).lastInsertRowid;
}

webhookRouter.post('/sepay', (req, res) => {
  const WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET) {
    const auth = req.headers['authorization'] || '';
    const provided = auth.replace(/^apikey\s+/i, '').trim();
    if (provided !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const { content, description, transferAmount, transactionDate, referenceCode, id: sepayId } = req.body;
  const rawText = content || description || '';
  const paidAt = transactionDate || new Date().toISOString();
  const db = getDb();

  const eventParams = { sepayId, rawContent: rawText, transferAmount, sepayRef: referenceCode };

  // ── Layer 1: QR code match ─────────────────────────────────────
  const qrParsed = parseQrCode(rawText);
  if (qrParsed) {
    const payment = db.prepare(`SELECT * FROM payments WHERE qr_code = ?`).get(qrParsed.qrCode);
    if (payment) {
      const eventId = logWebhookEvent(db, eventParams);
      db.prepare(`
        UPDATE payments SET status = 'paid', sepay_ref = ?, paid_at = ?, match_method = 'qr_code' WHERE id = ?
      `).run(referenceCode ?? null, paidAt, payment.id);
      db.prepare(`UPDATE webhook_events SET status = 'matched', matched_payment_id = ? WHERE id = ?`).run(payment.id, eventId);
      broadcast('payment_confirmed', { person_name: payment.person_name, week: payment.week_number, year: payment.year, amount: transferAmount });
      return res.json({ success: true, method: 'qr_code' });
    }
  }

  // ── Layer 2: Fuzzy name + amount validation ────────────────────
  const parsed = parseSePayContent(rawText);
  let canonicalName = parsed ? resolveCanonicalName(db, parsed.personName) : null;

  if (!canonicalName) {
    const senderName = extractSenderName(rawText);
    if (senderName) canonicalName = resolveCanonicalName(db, senderName);
  }

  if (canonicalName) {
    const unpaidWeeks = getUnpaidWeeks(db, canonicalName);
    const unpaidTotal = unpaidWeeks.reduce((s, w) => s + w.amount, 0);
    const amountOk = unpaidTotal > 0 && transferAmount === unpaidTotal;

    if (amountOk) {
      const eventId = logWebhookEvent(db, eventParams);
      const upsert = db.prepare(`
        INSERT INTO payments (person_name, week_number, year, amount, status, sepay_ref, paid_at, match_method)
        VALUES (@person_name, @week_number, @year, @amount, 'paid', @sepay_ref, @paid_at, 'fuzzy_name')
        ON CONFLICT(person_name, week_number, year)
        DO UPDATE SET status='paid', sepay_ref=@sepay_ref, paid_at=@paid_at, amount=@amount, match_method='fuzzy_name'
      `);
      db.transaction(() => {
        for (const w of unpaidWeeks) {
          upsert.run({ person_name: canonicalName, week_number: w.week, year: w.year, amount: w.amount, sepay_ref: referenceCode ?? null, paid_at: paidAt });
        }
      })();
      db.prepare(`UPDATE webhook_events SET status = 'matched' WHERE id = ?`).run(eventId);
      broadcast('payment_confirmed', { person_name: canonicalName, week: null, year: null, amount: transferAmount, all_weeks: unpaidWeeks });
      return res.json({ success: true, method: 'fuzzy_name' });
    }

    // Name found but amount mismatch → queue with suggestion
    const eventId = logWebhookEvent(db, eventParams);
    db.prepare(`UPDATE webhook_events SET notes = ? WHERE id = ?`).run(
      JSON.stringify({ suggested_person: canonicalName, unpaid_total: unpaidTotal }),
      eventId
    );
    broadcast('payment_queued', { id: eventId, amount: transferAmount });
    return res.json({ success: false, reason: 'queued_amount_mismatch' });
  }

  // ── Layer 3: Queue ─────────────────────────────────────────────
  const eventId = logWebhookEvent(db, eventParams);
  broadcast('payment_queued', { id: eventId, amount: transferAmount });
  return res.json({ success: false, reason: 'queued_no_name' });
});

webhookRouter.get('/unmatched', (req, res) => {
  const db = getDb();
  const events = db.prepare(
    `SELECT * FROM webhook_events WHERE status = 'queued' ORDER BY received_at DESC`
  ).all();

  const result = events.map(evt => {
    let suggestion = null;
    if (evt.notes) {
      try {
        const n = JSON.parse(evt.notes);
        if (n.suggested_person) suggestion = { person_name: n.suggested_person, unpaid_total: n.unpaid_total };
      } catch {}
    }
    return { ...evt, suggestion };
  });

  res.json({ events: result });
});

webhookRouter.post('/unmatched/:id/resolve', (req, res) => {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const { action, person_name, week, year, password } = req.body;

  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'wrong_password' });
  }

  const db = getDb();
  const evt = db.prepare(`SELECT * FROM webhook_events WHERE id = ?`).get(parseInt(req.params.id));
  if (!evt) return res.status(404).json({ error: 'not_found' });
  if (evt.status !== 'queued') return res.status(400).json({ error: 'already_resolved' });

  if (action === 'ignore') {
    db.prepare(`UPDATE webhook_events SET status = 'ignored' WHERE id = ?`).run(evt.id);
    return res.json({ success: true });
  }

  if (action === 'assign') {
    if (!person_name || !week || !year) return res.status(400).json({ error: 'invalid_params' });
    const paidAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO payments (person_name, week_number, year, amount, status, sepay_ref, paid_at, match_method)
      VALUES (@person_name, @week_number, @year, @amount, 'paid', @sepay_ref, @paid_at, 'manual')
      ON CONFLICT(person_name, week_number, year)
      DO UPDATE SET status='paid', sepay_ref=@sepay_ref, paid_at=@paid_at, amount=@amount, match_method='manual'
    `).run({ person_name, week_number: parseInt(week), year: parseInt(year), amount: evt.transfer_amount || 0, sepay_ref: evt.sepay_ref, paid_at: paidAt });

    const matched = db.prepare(
      `SELECT id FROM payments WHERE person_name = ? AND week_number = ? AND year = ?`
    ).get(person_name, parseInt(week), parseInt(year));

    db.prepare(`UPDATE webhook_events SET status = 'matched', matched_payment_id = ? WHERE id = ?`).run(matched?.id ?? null, evt.id);
    broadcast('payment_confirmed', { person_name, week: parseInt(week), year: parseInt(year), amount: evt.transfer_amount });
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'invalid_action' });
});
