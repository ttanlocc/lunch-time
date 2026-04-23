# Webhook Payment Reliability — Design Spec
**Date:** 2026-04-23  
**Status:** Approved

## Problem

Some banks (VPBank/MBVCB) send `content: null` and embed the QR memo inside `description`. The current webhook only reads `content`, so payments fail silently. Even when parsing succeeds, name resolution can fail, leaving payments unrecorded with no admin visibility.

**3 failure modes:**
1. `content: null` → `content_no_match` — payment dropped silently
2. Name parsed but not found in DB → `no_unpaid_weeks` — wrong resolution
3. Both above → payment never recorded, admin unaware

## Solution: 3-Layer Resolution + Admin Queue

### Layer 1 — Dynamic QR (primary, ~100% reliable)
Pre-generate a unique code per person per week, embedded in the QR `des` param. Webhook matches by code, not by name.

### Layer 2 — Fuzzy Name + Amount Match (~85% reliable)
For payments not using dynamic QR, parse `content || description`, resolve name via exact → accent-strip → Levenshtein ≤ 2 → sender name extraction. Validate `transferAmount` against unpaid total.

### Layer 3 — Admin Queue (100% manual fallback)
Unresolved payments go into a queue visible in admin UI. System provides suggestions. Admin can assign, pick someone else, or ignore.

---

## Data Layer

### Migrations on `payments` table
```sql
ALTER TABLE payments ADD COLUMN qr_code TEXT;
-- unique code, e.g. "LUNCH-AN-W16-2026"

ALTER TABLE payments ADD COLUMN match_method TEXT;
-- values: 'qr_code' | 'fuzzy_name' | 'manual'
```

### New `webhook_events` table
```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  sepay_id INTEGER,
  raw_content TEXT,
  transfer_amount INTEGER,
  sepay_ref TEXT,
  status TEXT NOT NULL,        -- 'matched' | 'queued' | 'ignored'
  matched_payment_id INTEGER REFERENCES payments(id),
  notes TEXT
);
```

All incoming webhooks are logged here regardless of match outcome.

---

## Dynamic QR Generation

**Code format:** `LUNCH-{NAME}-W{WEEK}-{YEAR}`  
`{NAME}` = uppercase, no diacritics, max 10 chars.  
Examples: `LUNCH-AN-W16-2026`, `LUNCH-KHOA-W16-2026`

**New endpoint:** `GET /api/debts/person/:name/qr?week=16&year=2026`

1. Calculate `amount` from unpaid orders for that person+week
2. Upsert `payments` row: `status='pending'`, `qr_code='LUNCH-AN-W16-2026'`
3. Return QR image URL:

```
https://qr.sepay.vn/img?acc={ACCOUNT}&bank={BANK}
  &amount={amount}
  &des=LUNCH-AN-W16-2026
  &template=compact
```

Frontend renders `<img src={url}>` directly — no image storage needed.

**`QRModal.jsx` change:** replace static QR URL with call to this endpoint.

---

## Webhook Resolution Pipeline

```
Webhook in
    │
    ▼
Log to webhook_events (status TBD)
    │
    ▼
[Step 1] Parse content || description
    │
    ├─ Pattern 0: qr_code match (LUNCH-{NAME}-W{WEEK}-{YEAR})
    │       ▼
    │   Lookup payments WHERE qr_code = ?
    │       ├─ Found → mark paid, match_method='qr_code' ✓
    │       └─ Not found → fall through
    │
    ├─ Pattern 1/2: name extracted
    │       ▼
    │   [Step 2] Fuzzy name resolution
    │   exact → accent-strip → Levenshtein ≤ 2 → sender name from description
    │       ├─ Resolved + transferAmount matches unpaid total → mark paid, match_method='fuzzy_name' ✓
    │       └─ Resolved but amount mismatch → queue
    │
    └─ No parse → queue

[Queue] → webhook_events.status = 'queued'
        → broadcast SSE 'payment_queued'
        → admin UI shows badge
```

---

## Admin UI: Unmatched Payments

**Sidebar:** Red badge on "Thanh toán chờ xử lý" menu item when queued count > 0.

**New page `UnmatchedPaymentsPage`** — each queued item shows:
- Date, amount, SePay reference
- Raw description text
- System suggestion: person + week + confidence + amount match status
- Actions: **Assign** (confirm suggestion) | **Chọn người khác** (dropdown) | **Bỏ qua** (mark ignored)

**New API endpoints:**
- `GET /api/webhook/unmatched` — list queued events with suggestions
- `POST /api/webhook/unmatched/:id/resolve` — `{ action: 'assign', person_name, week, year }` or `{ action: 'ignore' }`

Resolve calls the existing payment upsert logic and sets `match_method='manual'`.

---

## Files to Change

| File | Change |
|---|---|
| `server/src/db/schema.js` | Add `webhook_events` table, add columns to `payments` |
| `server/src/routes/webhook.js` | Add qr_code pattern, pipeline logic, queue on fail, new `/unmatched` routes |
| `server/src/routes/debts.js` | Add `GET /person/:name/qr` endpoint |
| `client/src/components/QRModal.jsx` | Call new QR endpoint instead of building static URL |
| `client/src/components/AdminSidebar.jsx` | Add badge for unmatched count |
| `client/src/pages/UnmatchedPaymentsPage.jsx` | New page |
| `client/src/layouts/AdminLayout.jsx` | Register new route |

---

## Out of Scope
- Teams notification for queued payments (deferred)
- Partial payment support (person pays less than full debt)
- Confidence score tuning UI
