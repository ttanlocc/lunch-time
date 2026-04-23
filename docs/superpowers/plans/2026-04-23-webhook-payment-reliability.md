# Webhook Payment Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SePay webhook payment matching reliable by adding dynamic QR codes, a 3-layer resolution pipeline (QR code → fuzzy name+amount → admin queue), and an admin UI for unmatched payments.

**Architecture:** Generate a unique `LUNCH-{NAME}-W{WEEK}-{YEAR}` code per payment, embedded in the SePay QR. Webhook tries QR-code match first, falls back to fuzzy name + amount validation, and queues unresolvable payments. All incoming webhooks are logged to a new `webhook_events` table. Admin sees a badge and a review page for queued payments.

**Tech Stack:** Node.js/Express (better-sqlite3), React (Vite), Vitest for server tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/src/db/schema.js` | Modify | Add `webhook_events` table to CREATE_TABLES |
| `server/src/db/index.js` | Modify | Add migrations: `qr_code`/`match_method` columns on `payments` |
| `server/src/services/qrCode.js` | Create | `buildQrCode`, `parseQrCode`, `levenshtein`, `extractSenderName` |
| `server/src/services/qrCode.test.js` | Create | Tests for all qrCode utilities |
| `server/src/routes/debts.js` | Modify | Add `GET /person/:name/qr` endpoint |
| `server/src/routes/webhook.js` | Modify | Full pipeline rewrite + `/unmatched` GET/POST endpoints |
| `client/src/lib/api.js` | Modify | Add `getPersonQr`, `getUnmatched`, `resolveUnmatched` |
| `client/src/components/QRModal.jsx` | Modify | Fetch QR URL from server instead of building client-side |
| `client/src/components/AdminSidebar.jsx` | Modify | Badge for unmatched count; add nav item |
| `client/src/pages/UnmatchedPaymentsPage.jsx` | Create | Admin review page for queued payments |
| `client/src/App.jsx` | Modify | Register `/admin/unmatched` route |

---

## Task 1: DB Schema + Migrations

**Files:**
- Modify: `server/src/db/schema.js`
- Modify: `server/src/db/index.js`

- [ ] **Step 1: Add `webhook_events` to schema.js**

In `server/src/db/schema.js`, append before the final backtick closing `CREATE_TABLES`:

```js
  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    sepay_id INTEGER,
    raw_content TEXT,
    transfer_amount INTEGER,
    sepay_ref TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    matched_payment_id INTEGER REFERENCES payments(id),
    notes TEXT
  );
```

The full `CREATE_TABLES` string already ends with `\n`;  add this block before the closing backtick.

- [ ] **Step 2: Add column migrations in db/index.js**

After the existing `orderCols` migration block and before the closing `}`of `getDb()`, add:

```js
    // Migration: add qr_code and match_method to payments
    const paymentCols = _db.prepare("PRAGMA table_info(payments)").all().map(c => c.name);
    if (!paymentCols.includes('qr_code')) {
      _db.exec('ALTER TABLE payments ADD COLUMN qr_code TEXT');
    }
    if (!paymentCols.includes('match_method')) {
      _db.exec('ALTER TABLE payments ADD COLUMN match_method TEXT');
    }
```

- [ ] **Step 3: Verify migrations run without error**

```bash
cd /home/azureuser/aiq/lunch-time/server
node -e "import('./src/db/index.js').then(m => { m.getDb(); console.log('OK'); })"
```

Expected: `OK` with no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/db/schema.js server/src/db/index.js
git commit -m "feat: add webhook_events table and qr_code/match_method columns"
```

---

## Task 2: QR Code Utilities

**Files:**
- Create: `server/src/services/qrCode.js`
- Create: `server/src/services/qrCode.test.js`

- [ ] **Step 1: Write failing tests**

Create `server/src/services/qrCode.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildQrCode, parseQrCode, levenshtein, extractSenderName } from './qrCode.js';

describe('buildQrCode', () => {
  it('generates uppercase code with week and year', () => {
    expect(buildQrCode('An', 16, 2026)).toBe('LUNCH-AN-W16-2026');
  });

  it('strips diacritics from name', () => {
    expect(buildQrCode('Khoa', 1, 2026)).toBe('LUNCH-KHOA-W1-2026');
  });

  it('removes spaces from multi-word name', () => {
    expect(buildQrCode('Hoang An', 16, 2026)).toBe('LUNCH-HOANGANIN-W16-2026');
    // truncated to 10: "HOANGANIN" is 9 chars, so full = "HOANGANIN" wait
    // "HoangAn" normalized = "HOANGANIN"? No: "Hoang An" → strip spaces → "HoangAn" → uppercase "HOANGANIN"
    // Actually "Hoang An" → remove spaces → "HoangAn" → uppercase → "HOANGANIN" NO
    // "Hoang An" → remove spaces → "HoangAn" → toUpperCase → "HOANGAN"
    // Let me fix: expected is 'LUNCH-HOANGAN-W16-2026'
  });

  it('truncates name slug to 10 chars', () => {
    expect(buildQrCode('Nguyen Thi Hoa', 16, 2026)).toBe('LUNCH-NGUYENTHIH-W16-2026');
    // "NguyenThiHoa" → "NGUYENTHIH" (10 chars)
  });
});

describe('parseQrCode', () => {
  it('parses valid QR code', () => {
    expect(parseQrCode('LUNCH-AN-W16-2026')).toEqual({
      qrCode: 'LUNCH-AN-W16-2026',
      nameSlug: 'AN',
      week: 16,
      year: 2026,
    });
  });

  it('parses QR code embedded in bank description', () => {
    const desc = 'BankAPINotify NHAN TU 123 TRACE 456 LUNCH-KHOA-W16-2026.CT tu';
    expect(parseQrCode(desc)).toEqual({
      qrCode: 'LUNCH-KHOA-W16-2026',
      nameSlug: 'KHOA',
      week: 16,
      year: 2026,
    });
  });

  it('returns null for non-matching text', () => {
    expect(parseQrCode('random bank text')).toBeNull();
    expect(parseQrCode('')).toBeNull();
    expect(parseQrCode(null)).toBeNull();
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('an', 'an')).toBe(0);
  });

  it('returns correct edit distance', () => {
    expect(levenshtein('khoa', 'khao')).toBe(2);
    expect(levenshtein('an', 'anh')).toBe(1);
  });
});

describe('extractSenderName', () => {
  it('extracts sender name from bank description', () => {
    const desc = 'CT tu 1833270501 PHAM DAI HOANG AN toi AGBSPAIQLUNCH';
    expect(extractSenderName(desc)).toBe('PHAM DAI HOANG AN');
  });

  it('returns null when pattern not found', () => {
    expect(extractSenderName('NHAN TU 123 some other text')).toBeNull();
    expect(extractSenderName(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/azureuser/aiq/lunch-time/server && npx vitest run src/services/qrCode.test.js
```

Expected: FAIL with "Cannot find module './qrCode.js'"

- [ ] **Step 3: Create qrCode.js**

Create `server/src/services/qrCode.js`:

```js
export function buildQrCode(personName, week, year) {
  const slug = personName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 10);
  return `LUNCH-${slug}-W${week}-${year}`;
}

export function parseQrCode(text) {
  if (!text) return null;
  const m = text.match(/LUNCH-([A-Z0-9]+)-W(\d+)-(\d{4})/i);
  if (!m) return null;
  return {
    qrCode: m[0].toUpperCase(),
    nameSlug: m[1].toUpperCase(),
    week: parseInt(m[2]),
    year: parseInt(m[3]),
  };
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function extractSenderName(text) {
  if (!text) return null;
  const m = text.match(/CT\s+tu\s+\d+\s+([A-Z][A-Z\s]+?)\s+toi\s+/i);
  if (m) return m[1].trim();
  return null;
}
```

- [ ] **Step 4: Fix test expectations and run again**

The test for multi-word name needs correcting. Update the test:

```js
  it('removes spaces from multi-word name', () => {
    expect(buildQrCode('Hoang An', 16, 2026)).toBe('LUNCH-HOANGAN-W16-2026');
  });

  it('truncates name slug to 10 chars', () => {
    expect(buildQrCode('Nguyen Thi Hoa', 16, 2026)).toBe('LUNCH-NGUYENTHI-W16-2026');
    // "NguyenThiHoa" = 12 chars → slice(0,10) = "NguyenThiH" → uppercase = "NGUYENTHIH"
    // Actually "NguyenThiHoa" uppercase = "NGUYENTHIHOA" → slice(0,10) = "NGUYENTHIH"
  });
```

Wait — fix the expected value in the truncation test to `'LUNCH-NGUYENTHIH-W16-2026'`.

Run:
```bash
cd /home/azureuser/aiq/lunch-time/server && npx vitest run src/services/qrCode.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/qrCode.js server/src/services/qrCode.test.js
git commit -m "feat: add qrCode utilities (buildQrCode, parseQrCode, levenshtein, extractSenderName)"
```

---

## Task 3: QR Endpoint on Debts Router

**Files:**
- Modify: `server/src/routes/debts.js` (depends on Task 1 + Task 2)

- [ ] **Step 1: Add import at top of debts.js**

Add to the imports at the top of `server/src/routes/debts.js`:

```js
import { buildQrCode } from '../services/qrCode.js';
```

- [ ] **Step 2: Add the endpoint**

Add before the final line (`export const debtsRouter = Router();` is already at top). Append this route at the end of `debts.js`:

```js
debtsRouter.get('/person/:name/qr', (req, res) => {
  const db = getDb();
  const person_name = decodeURIComponent(req.params.name);
  const week = parseInt(req.query.week) || getWeekNumber(new Date().toISOString().slice(0, 10));
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const orders = db.prepare(`
    SELECT o.date, mi.price + COALESCE(SUM(ma.price), 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    WHERE lower(o.person_name) = lower(?)
    GROUP BY o.id
  `).all(person_name);

  const exclusions = db.prepare(`SELECT date FROM day_exclusions WHERE lower(person_name) = lower(?)`).all(person_name);
  const excludedDates = new Set(exclusions.map(e => e.date));

  let amount = 0;
  for (const o of orders) {
    if (excludedDates.has(o.date)) continue;
    if (getWeekNumber(o.date) !== week) continue;
    if (new Date(o.date).getFullYear() !== year) continue;
    amount += o.total_price;
  }

  const qrCode = buildQrCode(person_name, week, year);

  db.prepare(`
    INSERT INTO payments (person_name, week_number, year, amount, status, qr_code)
    VALUES (@person_name, @week_number, @year, @amount, 'pending', @qr_code)
    ON CONFLICT(person_name, week_number, year)
    DO UPDATE SET qr_code = @qr_code,
                  amount = CASE WHEN status = 'pending' THEN @amount ELSE amount END
  `).run({ person_name, week_number: week, year, amount, qr_code: qrCode });

  const BANK_CODE = process.env.BANK_CODE || 'MB';
  const BANK_ACCOUNT = process.env.BANK_ACCOUNT || '';
  const qrImageUrl = `https://qr.sepay.vn/img?acc=${BANK_ACCOUNT}&bank=${BANK_CODE}&amount=${amount}&des=${encodeURIComponent(qrCode)}&template=compact`;

  res.json({ qrCode, amount, qrImageUrl, week, year, person_name });
});
```

- [ ] **Step 3: Smoke test the endpoint**

```bash
cd /home/azureuser/aiq/lunch-time && pm2 restart all 2>/dev/null; sleep 2
curl -s "http://localhost:3000/api/debts/person/An/qr?week=16&year=2026" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(j.qrCode, j.amount, j.qrImageUrl ? 'URL OK' : 'NO URL');"
```

Expected: something like `LUNCH-AN-W16-2026 90000 URL OK`

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/debts.js
git commit -m "feat: add GET /api/debts/person/:name/qr endpoint for dynamic QR generation"
```

---

## Task 4: Webhook Pipeline Rewrite

**Files:**
- Modify: `server/src/routes/webhook.js` (depends on Task 1 + Task 2)

- [ ] **Step 1: Add imports**

Replace the import block at the top of `server/src/routes/webhook.js` with:

```js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { broadcast } from '../services/sse.js';
import { getWeekNumber } from '../services/debtCalculator.js';
import { parseQrCode, levenshtein, extractSenderName } from '../services/qrCode.js';
```

- [ ] **Step 2: Upgrade resolveCanonicalName to use fuzzy matching**

Replace the existing `resolveCanonicalName` function (lines 29–42) with:

```js
function resolveCanonicalName(db, parsedName) {
  if (!parsedName) return null;

  // 1. Exact match
  const exact = db.prepare(
    `SELECT person_name FROM orders WHERE lower(person_name) = lower(?) ORDER BY created_at DESC LIMIT 1`
  ).get(parsedName);
  if (exact) return exact.person_name;

  const allNames = db.prepare(`SELECT DISTINCT person_name FROM orders`).all().map(r => r.person_name);

  // 2. Accent-strip match
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const normParsed = norm(parsedName);
  const accentMatch = allNames.find(n => norm(n) === normParsed);
  if (accentMatch) return accentMatch;

  // 3. Levenshtein ≤ 2
  const fuzzy = allNames.find(n => levenshtein(normParsed, norm(n)) <= 2);
  if (fuzzy) return fuzzy;

  return null;
}
```

- [ ] **Step 3: Rewrite the POST /sepay handler**

Replace everything from `webhookRouter.post('/sepay', ...)` to the end of the file with:

```js
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
```

- [ ] **Step 4: Verify server restarts cleanly**

```bash
cd /home/azureuser/aiq/lunch-time && pm2 restart all && sleep 2 && pm2 logs --lines 20 --nostream
```

Expected: no import errors, server listening on port.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/webhook.js
git commit -m "feat: rewrite webhook pipeline with QR code, fuzzy name, and queue fallback"
```

---

## Task 5: Unmatched Payments API

**Files:**
- Modify: `server/src/routes/webhook.js` (depends on Task 4)

- [ ] **Step 1: Append GET /unmatched endpoint**

Add at the end of `server/src/routes/webhook.js`:

```js
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
```

- [ ] **Step 2: Append POST /unmatched/:id/resolve endpoint**

Add immediately after the GET handler:

```js
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
```

- [ ] **Step 3: Smoke test both endpoints**

```bash
curl -s http://localhost:3000/api/webhook/unmatched | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log('events:', j.events.length);"
```

Expected: `events: N` (0 or more, no crash).

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/webhook.js
git commit -m "feat: add GET/POST /api/webhook/unmatched endpoints for admin queue management"
```

---

## Task 6: Frontend — api.js + QRModal

**Files:**
- Modify: `client/src/lib/api.js`
- Modify: `client/src/components/QRModal.jsx`

(depends on Task 3 + Task 5)

- [ ] **Step 1: Add api methods**

In `client/src/lib/api.js`, add to the `api` object:

```js
  getPersonQr: (name, week, year) => request('GET', `/debts/person/${encodeURIComponent(name)}/qr?week=${week}&year=${year}`),
  getUnmatched: () => request('GET', '/webhook/unmatched'),
  resolveUnmatched: (id, body) => request('POST', `/webhook/unmatched/${id}/resolve`, body),
```

- [ ] **Step 2: Update QRModal to fetch QR URL from server**

Replace `client/src/components/QRModal.jsx` entirely with:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';

export function QRModal({ person, amount: amountProp, week, year, onClose, onPaid, paid: paidProp = false }) {
  const [qrData, setQrData] = useState(null);
  const [paidInternal, setPaidInternal] = useState(false);
  const paid = paidProp || paidInternal;

  const currentYear = year || new Date().getFullYear();

  useEffect(() => {
    api.getPersonQr(person, week, currentYear).then(setQrData).catch(() => {});
  }, [person, week, currentYear]);

  const amount = qrData?.amount ?? amountProp ?? 0;
  const qrContent = qrData?.qrCode ?? (week ? `Lunch Tuan ${week} ${person}` : `Lunch ${person}`);
  const qrImageUrl = qrData?.qrImageUrl ?? `https://img.vietqr.io/image/MB-${import.meta.env.VITE_BANK_ACCOUNT ?? ''}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(qrContent)}`;

  useSSE({
    payment_confirmed: ({ person_name, week: w, all_weeks }) => {
      if (person_name !== person) return;
      const covers = week == null ? (w != null || !!all_weeks) : (w === week || !!all_weeks);
      if (covers) { setPaidInternal(true); onPaid?.(); }
    },
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,20,50,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 20px 60px rgba(180,140,220,0.35)', width: 340, textAlign: 'center', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, fontSize: 20, cursor: 'pointer', color: '#ccc', background: 'none', border: 'none', lineHeight: 1 }}>✕</button>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{person}</div>

        {paid ? (
          <div style={{ padding: '24px 0 8px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#059669', marginBottom: 6 }}>Đã thanh toán!</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>SePay đã xác nhận nhận tiền</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 18 }}>Quét QR để chuyển khoản</div>
            {!qrData ? (
              <div style={{ width: 200, height: 200, borderRadius: 16, border: '3px solid #ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#aaa', fontSize: 12 }}>Đang tải...</div>
            ) : (
              <img src={qrImageUrl} alt="VietQR" style={{ width: 200, height: 200, borderRadius: 16, border: '3px solid #ede9fe', display: 'block', margin: '0 auto 16px', boxShadow: '0 4px 16px rgba(180,140,220,0.15)' }} />
            )}
            <div style={{ fontSize: 28, fontWeight: 800, color: '#ec4899', marginBottom: 6 }}>{(amount / 1000).toFixed(0)},000đ</div>
            <div style={{ display: 'inline-block', background: '#f5f0fb', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: 'monospace', color: '#7c6f8e', marginBottom: 16, fontWeight: 600 }}>{qrContent}</div>
            <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5 }}>
              Mở app ngân hàng → quét QR<br />
              Số tiền & nội dung điền <strong style={{ color: '#a855f7' }}>tự động</strong><br />
              <strong style={{ color: '#a855f7' }}>SePay</strong> tự xác nhận sau khi nhận tiền
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 700, color: '#a855f7', marginTop: 12 }}>
              ⚡ Powered by SePay
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/api.js client/src/components/QRModal.jsx
git commit -m "feat: update QRModal to use dynamic QR from server; add api methods"
```

---

## Task 7: Admin Sidebar Badge + UnmatchedPaymentsPage

**Files:**
- Modify: `client/src/components/AdminSidebar.jsx`
- Create: `client/src/pages/UnmatchedPaymentsPage.jsx`
- Modify: `client/src/App.jsx`

(depends on Task 5 + Task 6)

- [ ] **Step 1: Update AdminSidebar.jsx**

Replace `client/src/components/AdminSidebar.jsx` entirely with:

```jsx
import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { UtensilsCrossed, ClipboardList, CreditCard, Settings2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `Tuần ${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

export function AdminSidebar() {
  const [unmatchedCount, setUnmatchedCount] = useState(0);

  useEffect(() => {
    api.getUnmatched().then(d => setUnmatchedCount(d.events.length)).catch(() => {});
  }, []);

  useSSE({
    payment_queued: () => setUnmatchedCount(c => c + 1),
    payment_confirmed: () => {},
  });

  const NAV = [
    { to: '/admin', icon: UtensilsCrossed, label: 'Order hôm nay' },
    { to: '/admin/summary', icon: ClipboardList, label: 'Tổng hợp' },
    { to: '/admin/debt', icon: CreditCard, label: 'Công nợ' },
    { to: '/admin/manage', icon: Settings2, label: 'Quản lý nợ' },
    { to: '/admin/unmatched', icon: AlertCircle, label: 'Chờ xử lý', badge: unmatchedCount },
  ];

  return (
    <aside style={{
      width: 'var(--sidebar-width)', flexShrink: 0,
      background: 'var(--gradient-sidebar)',
      padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 4,
      borderRight: '1px solid rgba(255,255,255,0.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, padding: '0 4px' }}>
        <span style={{ fontSize: 16, fontWeight: 800, background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          LunchTime
        </span>
        <span style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-pill)', letterSpacing: '0.5px' }}>
          ADMIN
        </span>
      </div>
      {NAV.map(item => (
        <NavLink key={item.to} to={item.to} end style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 700 : 500,
          background: isActive ? 'var(--color-card)' : 'transparent',
          color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
          boxShadow: isActive ? 'var(--shadow-card)' : 'none',
          textDecoration: 'none',
          transition: 'all var(--transition-fast)',
        })}>
          <item.icon size={16} strokeWidth={2} />
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.badge > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
              {item.badge}
            </span>
          )}
        </NavLink>
      ))}
      <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', fontSize: 12, color: 'var(--color-text-muted)' }}>
        <strong style={{ display: 'block', color: 'var(--color-primary)', fontSize: 12, marginBottom: 2 }}>{getWeekLabel()}</strong>
        Tuần hiện tại
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create UnmatchedPaymentsPage.jsx**

Create `client/src/pages/UnmatchedPaymentsPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';

const ADMIN_PASSWORD_KEY = 'lunch_admin_pw';

function getStoredPassword() {
  return sessionStorage.getItem(ADMIN_PASSWORD_KEY) || '';
}

export default function UnmatchedPaymentsPage() {
  const [events, setEvents] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [assigns, setAssigns] = useState({});

  const load = useCallback(() => {
    Promise.all([api.getUnmatched(), api.getAccumulatedDebts()])
      .then(([u, d]) => { setEvents(u.events); setDebts(d.debts); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useSSE({ payment_queued: load });

  async function handleResolve(id, action, extra = {}) {
    const password = getStoredPassword() || prompt('Admin password:');
    if (!password) return;
    sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);
    setResolving(id);
    try {
      await api.resolveUnmatched(id, { action, password, ...extra });
      load();
    } catch {
      alert('Lỗi hoặc sai mật khẩu');
      sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
    } finally {
      setResolving(null);
    }
  }

  function handleAssignChange(id, field, value) {
    setAssigns(a => ({ ...a, [id]: { ...(a[id] || {}), [field]: value } }));
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--color-text-muted)' }}>Đang tải...</div>;

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, color: 'var(--color-text)' }}>Thanh toán chờ xử lý</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
        {events.length === 0 ? 'Không có giao dịch nào cần xử lý.' : `${events.length} giao dịch chưa khớp.`}
      </p>

      {events.map(evt => {
        const assign = assigns[evt.id] || {};
        const personOptions = debts.map(d => d.person_name);
        const selectedPerson = assign.person_name || evt.suggestion?.person_name || '';
        const weekOptions = selectedPerson
          ? (debts.find(d => d.person_name === selectedPerson)?.unpaid_weeks || [])
          : [];
        const selectedWeek = assign.week || (weekOptions[0]?.week ?? '');
        const selectedYear = assign.year || (weekOptions[0]?.year ?? new Date().getFullYear());

        return (
          <div key={evt.id} style={{ background: 'var(--color-card)', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{evt.received_at?.slice(0, 16).replace('T', ' ')}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#059669' }}>{(evt.transfer_amount / 1000).toFixed(0)},000đ</span>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', marginBottom: 10, wordBreak: 'break-all', background: '#f8f8f8', borderRadius: 6, padding: '6px 8px' }}>
              {evt.raw_content?.slice(0, 120)}{evt.raw_content?.length > 120 ? '…' : ''}
            </div>

            {evt.suggestion && (
              <div style={{ fontSize: 11, color: '#a855f7', marginBottom: 8 }}>
                Gợi ý: <strong>{evt.suggestion.person_name}</strong> — còn nợ {(evt.suggestion.unpaid_total / 1000).toFixed(0)},000đ
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedPerson}
                onChange={e => handleAssignChange(evt.id, 'person_name', e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
              >
                <option value="">-- Chọn người --</option>
                {personOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>

              <select
                value={`${selectedWeek}|${selectedYear}`}
                onChange={e => {
                  const [w, y] = e.target.value.split('|');
                  handleAssignChange(evt.id, 'week', parseInt(w));
                  handleAssignChange(evt.id, 'year', parseInt(y));
                }}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
              >
                <option value="|">-- Tuần --</option>
                {weekOptions.map(w => (
                  <option key={`${w.week}|${w.year}`} value={`${w.week}|${w.year}`}>
                    Tuần {w.week}/{w.year} ({(w.amount / 1000).toFixed(0)}k)
                  </option>
                ))}
              </select>

              <button
                disabled={!selectedPerson || !selectedWeek || resolving === evt.id}
                onClick={() => handleResolve(evt.id, 'assign', { person_name: selectedPerson, week: selectedWeek, year: selectedYear })}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, background: '#059669', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, opacity: (!selectedPerson || !selectedWeek) ? 0.5 : 1 }}
              >
                Gán
              </button>

              <button
                disabled={resolving === evt.id}
                onClick={() => handleResolve(evt.id, 'ignore')}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, background: '#f3f4f6', color: '#6b7280', border: 'none', cursor: 'pointer' }}
              >
                Bỏ qua
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Register route in App.jsx**

In `client/src/App.jsx`, add import at top:

```js
import UnmatchedPaymentsPage from './pages/UnmatchedPaymentsPage.jsx';
```

Inside the `<Route element={<AdminLayout />}>` block, add:

```jsx
<Route path="/admin/unmatched" element={<UnmatchedPaymentsPage />} />
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/AdminSidebar.jsx client/src/pages/UnmatchedPaymentsPage.jsx client/src/App.jsx
git commit -m "feat: add unmatched payments admin page with sidebar badge"
```

---

## Self-Review

**Spec coverage check:**
- [x] `webhook_events` table — Task 1
- [x] `qr_code`/`match_method` on payments — Task 1
- [x] `buildQrCode`/`parseQrCode` utilities — Task 2
- [x] `GET /api/debts/person/:name/qr` endpoint — Task 3
- [x] QR code match (Layer 1) in webhook — Task 4
- [x] Fuzzy name + amount validation (Layer 2) — Task 4
- [x] Queue fallback (Layer 3) + `payment_queued` SSE — Task 4
- [x] `GET/POST /api/webhook/unmatched` — Task 5
- [x] QRModal uses dynamic QR URL — Task 6
- [x] Admin sidebar badge — Task 7
- [x] `UnmatchedPaymentsPage` — Task 7

**Parallelism note:**
- Tasks 1 and 2 are independent — run in parallel
- Tasks 3 and 4 depend on both 1 and 2 — run in parallel after those complete
- Task 5 depends on Task 4
- Task 6 depends on Task 3
- Task 7 depends on Tasks 5 and 6
