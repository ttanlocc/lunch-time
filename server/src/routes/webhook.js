// server/src/routes/webhook.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { broadcast } from '../services/sse.js';
import { parseQrCode, levenshtein, extractSenderName } from '../services/qrCode.js';
import { sendPaymentConfirmation } from '../services/debtReminder.js';

export const webhookRouter = Router();

// Banking/wallet noise words that get appended after the name (no separator)
// e.g. MoMo: "Lunch Nguyen CHUYEN TIEN OQCH... MOMO...". Cut the name here.
const NAME_STOP_WORDS = new Set([
  'chuyen', 'tien', 'ct', 'ck', 'momo', 'ft', 'tt', 'thanh', 'toan',
  'noi', 'dung', 'nhan', 'tu', 'toi', 'trace', 'nd', 'gd',
]);

// Drop trailing banking-noise tokens from a captured name.
function trimNoiseFromName(raw) {
  const words = raw.trim().split(/\s+/);
  const kept = [];
  for (const w of words) {
    const norm = w
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (NAME_STOP_WORDS.has(norm)) break;
    kept.push(w);
  }
  return kept.join(' ');
}

function toTitleCase(name) {
  return name.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export function parseSePayContent(content) {
  if (!content) return null;
  // Pattern 1: "Lunch Tuan 16 Khoa" — pay specific week
  const weekMatch = content.match(/lunch\s+tuan\s+(\d+)\s+([a-zA-ZÀ-ỹ]+(?:\s+[a-zA-ZÀ-ỹ]+)*)/i);
  if (weekMatch) {
    const week = parseInt(weekMatch[1]);
    const personName = toTitleCase(trimNoiseFromName(weekMatch[2]));
    if (personName) return { week, personName };
  }
  // Pattern 2: "Lunch Khoa" — pay all unpaid weeks
  const allMatch = content.match(/lunch\s+([a-zA-ZÀ-ỹ]+(?:\s+[a-zA-ZÀ-ỹ]+)*)/i);
  if (allMatch) {
    const personName = toTitleCase(trimNoiseFromName(allMatch[1]));
    if (personName) return { week: null, personName };
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

  const norm = s => s.replace(/[\u0110]/g, 'D').replace(/[\u0111]/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const normParsed = norm(parsedName);
  const accentMatch = allNames.find(n => norm(n) === normParsed);
  if (accentMatch) return accentMatch;

  let bestName = null, bestDist = Infinity;
  for (const n of allNames) {
    const d = levenshtein(normParsed, norm(n));
    if (d < bestDist) { bestDist = d; bestName = n; }
  }
  if (bestDist <= 2) return bestName;

  return null;
}

function getUnpaidDays(db, personName) {
  const orders = db.prepare(`
    SELECT o.date, o.price as total_price
    FROM orders o
    WHERE lower(o.person_name) = lower(?)
  `).all(personName);

  const excludedDates = new Set(
    db.prepare('SELECT date FROM day_exclusions WHERE lower(person_name) = lower(?)').all(personName).map(e => e.date)
  );
  const paidDates = new Set(
    db.prepare("SELECT date FROM payments WHERE lower(person_name) = lower(?) AND status='paid'").all(personName).map(p => p.date)
  );

  const dayMap = {};
  for (const o of orders) {
    if (excludedDates.has(o.date) || paidDates.has(o.date)) continue;
    dayMap[o.date] = (dayMap[o.date] || 0) + o.total_price;
  }

  // Keep discount days (net < 0) so the auto-match total equals the net owed;
  // only drop days that settle to exactly 0.
  return Object.entries(dayMap).filter(([, amount]) => amount !== 0).map(([date, amount]) => ({ date, amount }));
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
    const payment = db.prepare(`SELECT * FROM payments WHERE qr_code = ? LIMIT 1`).get(qrParsed.qrCode);
    if (payment) {
      // Amount guard: only auto-clear when the transfer matches the total still
      // pending for this QR. Without this, any transfer carrying the right memo
      // wipes the whole debt — including underpayments.
      const expected = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE qr_code = ? AND status = 'pending'`
      ).get(qrParsed.qrCode).total;

      if (expected > 0 && transferAmount === expected) {
        const eventId = logWebhookEvent(db, eventParams);
        db.prepare(`
          UPDATE payments SET status='paid', sepay_ref=?, paid_at=?, match_method='qr_code'
          WHERE qr_code=? AND status='pending'
        `).run(referenceCode ?? null, paidAt, qrParsed.qrCode);
        db.prepare(`UPDATE webhook_events SET status='matched', matched_payment_id=? WHERE id=?`).run(payment.id, eventId);
        broadcast('payment_confirmed', { person_name: payment.person_name, amount: transferAmount });
        sendPaymentConfirmation(db, payment.person_name, transferAmount);
        return res.json({ success: true, method: 'qr_code' });
      }

      // QR matched but amount is off → queue for manual review (don't auto-clear).
      const eventId = logWebhookEvent(db, eventParams);
      db.prepare(`UPDATE webhook_events SET notes=? WHERE id=?`).run(
        JSON.stringify({ suggested_person: payment.person_name, unpaid_total: expected }),
        eventId
      );
      broadcast('payment_queued', { id: eventId, amount: transferAmount });
      return res.json({ success: false, reason: 'queued_qr_amount_mismatch' });
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
    const unpaidDays = getUnpaidDays(db, canonicalName);
    const unpaidTotal = unpaidDays.reduce((s, d) => s + d.amount, 0);
    const amountOk = unpaidTotal > 0 && transferAmount === unpaidTotal;

    if (amountOk) {
      const eventId = logWebhookEvent(db, eventParams);
      const upsert = db.prepare(`
        INSERT INTO payments (person_name, date, amount, status, sepay_ref, paid_at, match_method)
        VALUES (@person_name, @date, @amount, 'paid', @sepay_ref, @paid_at, 'fuzzy_name')
        ON CONFLICT(person_name, date)
        DO UPDATE SET status='paid', sepay_ref=@sepay_ref, paid_at=@paid_at, amount=@amount, match_method='fuzzy_name'
      `);
      db.transaction(() => {
        for (const d of unpaidDays) {
          upsert.run({ person_name: canonicalName, date: d.date, amount: d.amount, sepay_ref: referenceCode ?? null, paid_at: paidAt });
        }
      })();
      db.prepare(`UPDATE webhook_events SET status='matched' WHERE id=?`).run(eventId);
      broadcast('payment_confirmed', { person_name: canonicalName, amount: transferAmount });
      sendPaymentConfirmation(db, canonicalName, transferAmount);
      return res.json({ success: true, method: 'fuzzy_name' });
    }

    // Name found but amount mismatch → queue with suggestion
    const eventId = logWebhookEvent(db, eventParams);
    db.prepare(`UPDATE webhook_events SET notes=? WHERE id=?`).run(
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
    if (!person_name) return res.status(400).json({ error: 'invalid_params' });
    const paidAt = new Date().toISOString();
    const unpaidDays = getUnpaidDays(db, person_name);
    if (!unpaidDays.length) return res.status(400).json({ error: 'no_unpaid_days' });

    const upsert = db.prepare(`
      INSERT INTO payments (person_name, date, amount, status, sepay_ref, paid_at, match_method)
      VALUES (@person_name, @date, @amount, 'paid', @sepay_ref, @paid_at, 'manual')
      ON CONFLICT(person_name, date)
      DO UPDATE SET status='paid', sepay_ref=@sepay_ref, paid_at=@paid_at, amount=@amount, match_method='manual'
    `);
    db.transaction(() => {
      for (const d of unpaidDays) {
        upsert.run({ person_name, date: d.date, amount: d.amount, sepay_ref: evt.sepay_ref, paid_at: paidAt });
      }
    })();

    const matched = db.prepare(`SELECT id FROM payments WHERE person_name=? ORDER BY id DESC LIMIT 1`).get(person_name);
    db.prepare(`UPDATE webhook_events SET status='matched', matched_payment_id=? WHERE id=?`).run(matched?.id ?? null, evt.id);
    broadcast('payment_confirmed', { person_name, amount: evt.transfer_amount });
    sendPaymentConfirmation(db, person_name, evt.transfer_amount);
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'invalid_action' });
});
