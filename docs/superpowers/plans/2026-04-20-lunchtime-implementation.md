# LunchTime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop web app for a 6-person lunch ordering group — daily menu import, order tracking, auto-lock at 11:00, order summary copy for Zalo, and debt tracking with VietQR + SePay auto-confirmation.

**Architecture:** Express.js REST API + SQLite on the backend, React + Vite on the frontend, both served from an Azure VM via Nginx. Realtime updates via SSE — server pushes `order_submitted`, `order_locked`, `payment_confirmed` events to all connected browsers. SePay webhook auto-confirms payments; VietQR generates QR codes shown in a modal.

**Tech Stack:** Node.js 20, Express 4, better-sqlite3, node-cron, React 18, Vite 5, Vitest, Supertest, PM2, Nginx

---

## File Structure

```
/home/azureuser/aiq/lunch-time/
├── server/
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.js           # DB connection singleton (better-sqlite3)
│   │   │   └── schema.js          # CREATE TABLE statements + migrations
│   │   ├── services/
│   │   │   ├── menuParser.js      # Parse Zalo text → {new_items, available, unavailable, addons}
│   │   │   ├── debtCalculator.js  # Sum orders per person per week → debt amount
│   │   │   └── sse.js             # SSE client registry + broadcast(event, data)
│   │   ├── routes/
│   │   │   ├── menu.js            # GET /api/menu/today, POST /api/menu/import, POST /api/menu/lock
│   │   │   ├── orders.js          # GET /api/orders/today, POST /api/orders
│   │   │   ├── debts.js           # GET /api/debts?week=&year=
│   │   │   ├── events.js          # GET /api/events (SSE stream)
│   │   │   └── webhook.js         # POST /api/webhook/sepay
│   │   └── cron.js                # node-cron: auto-lock at 11:00 daily
│   ├── index.js                   # Express app entry point
│   ├── tests/
│   │   ├── menuParser.test.js
│   │   ├── debtCalculator.test.js
│   │   └── webhook.test.js
│   └── package.json
├── client/
│   ├── src/
│   │   ├── lib/
│   │   │   └── api.js             # fetch() wrappers for all API calls
│   │   ├── hooks/
│   │   │   └── useSSE.js          # EventSource hook → fires callbacks on events
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── NameSelector.jsx   # Click-to-select name chips
│   │   │   ├── MenuList.jsx       # Menu rows + inline addon widget
│   │   │   ├── QRModal.jsx        # VietQR modal with SePay auto-close
│   │   │   └── Layout.jsx         # Sidebar + main content shell
│   │   ├── pages/
│   │   │   ├── OrderPage.jsx
│   │   │   ├── ImportMenuPage.jsx
│   │   │   ├── SummaryPage.jsx
│   │   │   └── DebtPage.jsx
│   │   ├── App.jsx                # Router + SSE provider
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
├── data/                          # gitignored — SQLite lives here
├── ecosystem.config.js            # PM2 config
└── nginx.conf                     # Nginx site config
```

---

## Task 1: Project Setup

**Files:**
- Create: `server/package.json`
- Create: `client/package.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize server package**

```bash
cd /home/azureuser/aiq/lunch-time
mkdir -p server/src/db server/src/services server/src/routes server/tests
mkdir -p client data
cd server
npm init -y
npm install express better-sqlite3 node-cron cors
npm install -D vitest supertest
```

- [ ] **Step 2: Set test script in server/package.json**

Edit `server/package.json` — replace the `scripts` block:
```json
{
  "scripts": {
    "start": "node ../index.js",
    "dev": "node --watch ../index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "type": "module"
}
```

- [ ] **Step 3: Initialize client with Vite + React**

```bash
cd /home/azureuser/aiq/lunch-time
npm create vite@latest client -- --template react
cd client
npm install
```

- [ ] **Step 4: Add proxy to client/vite.config.js** (forwards `/api` to Express during dev)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
data/
client/dist/
.env
```

- [ ] **Step 6: Commit**

```bash
cd /home/azureuser/aiq/lunch-time
git init
git add server/package.json client/package.json client/vite.config.js .gitignore
git commit -m "chore: project setup — server (Express) + client (React/Vite)"
```

---

## Task 2: Database Schema

**Files:**
- Create: `server/src/db/schema.js`
- Create: `server/src/db/index.js`

- [ ] **Step 1: Write schema.js**

```js
// server/src/db/schema.js
export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    normalized_name TEXT NOT NULL UNIQUE,
    price INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS menu_addons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    name TEXT NOT NULL,
    price INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    date TEXT NOT NULL,
    is_available INTEGER NOT NULL DEFAULT 1,
    is_locked INTEGER NOT NULL DEFAULT 0,
    UNIQUE(menu_item_id, date)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_name TEXT NOT NULL,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_addons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    addon_id INTEGER NOT NULL REFERENCES menu_addons(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_name TEXT NOT NULL,
    week_number INTEGER NOT NULL,
    year INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    sepay_ref TEXT,
    paid_at TEXT,
    UNIQUE(person_name, week_number, year)
  );
`;
```

- [ ] **Step 2: Write db/index.js**

```js
// server/src/db/index.js
import Database from 'better-sqlite3';
import { CREATE_TABLES } from './schema.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../../data/lunch.db');

let _db;

export function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.exec(CREATE_TABLES);
  }
  return _db;
}
```

- [ ] **Step 3: Verify DB initializes without error**

```bash
cd /home/azureuser/aiq/lunch-time
mkdir -p data
node -e "import('./server/src/db/index.js').then(m => { m.getDb(); console.log('DB OK'); })"
```
Expected output: `DB OK`

- [ ] **Step 4: Commit**

```bash
git add server/src/db/
git commit -m "feat: SQLite schema — menu_items, orders, payments, daily_menu"
```

---

## Task 3: Menu Parser Service (TDD)

**Files:**
- Create: `server/src/services/menuParser.js`
- Create: `server/tests/menuParser.test.js`

- [ ] **Step 1: Write failing tests**

```js
// server/tests/menuParser.test.js
import { describe, it, expect } from 'vitest';
import { parseMenuText, normalizeName } from '../src/services/menuParser.js';

const SAMPLE_MENU = `@All
- Thịt kho đậu hũ 30k
- Hến xào sả ớt 30k
- Cơm gà mắm tỏi: 35k
- Cơm sườn: 30k
+ bì || chả || ốp la: 5k/phần
- Nui xào bò trứng: 40k
Gọi thêm:
- Sườn thêm: 25k
- Ốp la thêm: 5k
Kính mời 🤤`;

describe('normalizeName', () => {
  it('strips punctuation and trims whitespace', () => {
    expect(normalizeName('Cơm gà mắm tỏi:')).toBe('cơm gà mắm tỏi');
    expect(normalizeName('  Nui xào bò trứng  ')).toBe('nui xào bò trứng');
  });
});

describe('parseMenuText', () => {
  it('parses menu items with price', () => {
    const result = parseMenuText(SAMPLE_MENU);
    expect(result.items).toContainEqual(
      expect.objectContaining({ name: 'Thịt kho đậu hũ', price: 30000, category: 'main' })
    );
    expect(result.items).toContainEqual(
      expect.objectContaining({ name: 'Cơm gà mắm tỏi', price: 35000, category: 'main' })
    );
  });

  it('parses addons and links to previous item', () => {
    const result = parseMenuText(SAMPLE_MENU);
    const com_suon = result.items.find(i => i.name === 'Cơm sườn');
    expect(com_suon).toBeDefined();
    expect(result.addons[com_suon.normalizedName]).toEqual([
      { name: 'bì', price: 5000 },
      { name: 'chả', price: 5000 },
      { name: 'ốp la', price: 5000 },
    ]);
  });

  it('puts "Gọi thêm" section items into extras category', () => {
    const result = parseMenuText(SAMPLE_MENU);
    expect(result.items).toContainEqual(
      expect.objectContaining({ name: 'Sườn thêm', price: 25000, category: 'extra' })
    );
  });

  it('handles "35k" and "5k/phần" price formats', () => {
    const result = parseMenuText('- Cơm test: 35k\n- Addon test: 5k/phần');
    expect(result.items[0].price).toBe(35000);
    expect(result.items[1].price).toBe(5000);
  });

  it('is idempotent — parsing same text twice gives same items', () => {
    const r1 = parseMenuText(SAMPLE_MENU);
    const r2 = parseMenuText(SAMPLE_MENU);
    expect(r1.items.map(i => i.normalizedName).sort())
      .toEqual(r2.items.map(i => i.normalizedName).sort());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/azureuser/aiq/lunch-time/server
npm test -- tests/menuParser.test.js
```
Expected: FAIL — `Cannot find module '../src/services/menuParser.js'`

- [ ] **Step 3: Implement menuParser.js**

```js
// server/src/services/menuParser.js

export function normalizeName(name) {
  return name.replace(/[:\-,]/g, '').trim().toLowerCase();
}

function parsePrice(raw) {
  // "35k" → 35000, "5k/phần" → 5000
  const match = raw.match(/(\d+)k/i);
  return match ? parseInt(match[1]) * 1000 : 0;
}

export function parseMenuText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  const addons = {}; // normalizedName → [{name, price}]

  let inExtras = false;
  let lastItemKey = null;

  for (const line of lines) {
    if (/^gọi thêm[:\s]/i.test(line)) {
      inExtras = true;
      lastItemKey = null;
      continue;
    }

    if (line.startsWith('-')) {
      // "-  Name [:]? price k"
      const match = line.match(/^-\s+(.+?)\s+(\d+k(?:\/\S+)?)\s*$/i);
      if (!match) continue;
      const [, rawName, rawPrice] = match;
      const name = rawName.replace(/:$/, '').trim();
      const normalizedName = normalizeName(name);
      const price = parsePrice(rawPrice);
      const category = inExtras ? 'extra' : 'main';
      items.push({ name, normalizedName, price, category });
      lastItemKey = inExtras ? null : normalizedName;
    } else if (line.startsWith('+') && lastItemKey) {
      // "+ bì || chả || ốp la: 5k/phần"
      const match = line.match(/^\+\s+(.+?):\s*(\d+k(?:\/\S+)?)/i);
      if (!match) continue;
      const [, names, rawPrice] = match;
      const price = parsePrice(rawPrice);
      addons[lastItemKey] = names.split('||').map(n => ({
        name: n.trim(),
        price,
      }));
    }
  }

  return { items, addons };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/azureuser/aiq/lunch-time/server
npm test -- tests/menuParser.test.js
```
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/menuParser.js server/tests/menuParser.test.js
git commit -m "feat: menu parser — parse Zalo text to items + addons (TDD)"
```

---

## Task 4: Debt Calculator Service (TDD)

**Files:**
- Create: `server/src/services/debtCalculator.js`
- Create: `server/tests/debtCalculator.test.js`

- [ ] **Step 1: Write failing tests**

```js
// server/tests/debtCalculator.test.js
import { describe, it, expect } from 'vitest';
import { getWeekNumber, calcDebtForWeek } from '../src/services/debtCalculator.js';

describe('getWeekNumber', () => {
  it('returns ISO week number for a date string', () => {
    expect(getWeekNumber('2026-04-21')).toBe(17);
    expect(getWeekNumber('2026-01-05')).toBe(2);
  });
});

describe('calcDebtForWeek', () => {
  it('sums order amounts per person for a given week', () => {
    const orders = [
      { person_name: 'An', total_price: 35000, date: '2026-04-21' },
      { person_name: 'An', total_price: 40000, date: '2026-04-22' },
      { person_name: 'Bình', total_price: 30000, date: '2026-04-21' },
    ];
    const result = calcDebtForWeek(orders, 17, 2026);
    expect(result).toContainEqual({ person_name: 'An', amount: 75000 });
    expect(result).toContainEqual({ person_name: 'Bình', amount: 30000 });
  });

  it('returns empty array when no orders', () => {
    expect(calcDebtForWeek([], 17, 2026)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd /home/azureuser/aiq/lunch-time/server
npm test -- tests/debtCalculator.test.js
```
Expected: FAIL

- [ ] **Step 3: Implement debtCalculator.js**

```js
// server/src/services/debtCalculator.js

export function getWeekNumber(dateStr) {
  const d = new Date(dateStr);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d - startOfYear) / 86400000);
  // ISO week: week 1 = week containing first Thursday of January
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.floor((d - startOfWeek1) / (7 * 86400000)) + 1;
  return weekNum;
}

export function calcDebtForWeek(orders, week, year) {
  const map = {};
  for (const o of orders) {
    if (getWeekNumber(o.date) !== week) continue;
    if (new Date(o.date).getFullYear() !== year) continue;
    if (!map[o.person_name]) map[o.person_name] = 0;
    map[o.person_name] += o.total_price;
  }
  return Object.entries(map).map(([person_name, amount]) => ({ person_name, amount }));
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd /home/azureuser/aiq/lunch-time/server
npm test -- tests/debtCalculator.test.js
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/debtCalculator.js server/tests/debtCalculator.test.js
git commit -m "feat: debt calculator — week number + per-person sum (TDD)"
```

---

## Task 5: SSE Service

**Files:**
- Create: `server/src/services/sse.js`

- [ ] **Step 1: Write sse.js**

```js
// server/src/services/sse.js
// Manages connected SSE clients and broadcasts events to all of them.

const clients = new Set();

export function addClient(res) {
  clients.add(res);
}

export function removeClient(res) {
  clients.delete(res);
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}
```

- [ ] **Step 2: Verify module loads**

```bash
cd /home/azureuser/aiq/lunch-time
node -e "import('./server/src/services/sse.js').then(() => console.log('SSE OK'))"
```
Expected: `SSE OK`

- [ ] **Step 3: Commit**

```bash
git add server/src/services/sse.js
git commit -m "feat: SSE service — client registry + broadcast"
```

---

## Task 6: Express App + Menu Routes

**Files:**
- Create: `server/index.js`
- Create: `server/src/routes/events.js`
- Create: `server/src/routes/menu.js`

- [ ] **Step 1: Write server/index.js**

```js
// server/index.js
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
```

- [ ] **Step 2: Write events route**

```js
// server/src/routes/events.js
import { Router } from 'express';
import { addClient, removeClient } from '../services/sse.js';

export const eventsRouter = Router();

eventsRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial ping so browser knows connection is live
  res.write('event: ping\ndata: {}\n\n');

  addClient(res);
  req.on('close', () => removeClient(res));
});
```

- [ ] **Step 3: Write menu route**

```js
// server/src/routes/menu.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { parseMenuText, normalizeName } from '../services/menuParser.js';
import { broadcast } from '../services/sse.js';

export const menuRouter = Router();

// GET /api/menu/today
menuRouter.get('/today', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const items = db.prepare(`
    SELECT mi.id, mi.name, mi.price, mi.category,
           COALESCE(dm.is_available, 0) as is_available,
           COALESCE(dm.is_locked, 0) as is_locked
    FROM menu_items mi
    LEFT JOIN daily_menu dm ON dm.menu_item_id = mi.id AND dm.date = ?
    WHERE COALESCE(dm.is_available, 0) = 1
    ORDER BY mi.category, mi.name
  `).all(today);

  const addons = db.prepare(`
    SELECT * FROM menu_addons WHERE menu_item_id IN (${items.map(() => '?').join(',') || 'NULL'})
  `).all(...items.map(i => i.id));

  const addonsByItem = {};
  for (const a of addons) {
    if (!addonsByItem[a.menu_item_id]) addonsByItem[a.menu_item_id] = [];
    addonsByItem[a.menu_item_id].push(a);
  }

  res.json({ items: items.map(i => ({ ...i, addons: addonsByItem[i.id] || [] })), is_locked: items[0]?.is_locked === 1 });
});

// POST /api/menu/import
menuRouter.post('/import', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const { items, addons } = parseMenuText(text);

  const upsertItem = db.prepare(`
    INSERT INTO menu_items (name, normalized_name, price, category)
    VALUES (@name, @normalizedName, @price, @category)
    ON CONFLICT(normalized_name) DO UPDATE SET price = @price
  `);

  const upsertDaily = db.prepare(`
    INSERT INTO daily_menu (menu_item_id, date, is_available)
    VALUES (@menu_item_id, @date, 1)
    ON CONFLICT(menu_item_id, date) DO UPDATE SET is_available = 1
  `);

  const disableOthers = db.prepare(`
    UPDATE daily_menu SET is_available = 0 WHERE date = ? AND menu_item_id NOT IN (${items.map(() => '?').join(',') || '-1'})
  `);

  const upsertAddon = db.prepare(`
    INSERT OR IGNORE INTO menu_addons (menu_item_id, name, price) VALUES (?, ?, ?)
  `);

  const importAll = db.transaction(() => {
    const result = { new_items: [], available: [], unavailable: [] };

    // Upsert all parsed items
    for (const item of items) {
      const existing = db.prepare('SELECT id FROM menu_items WHERE normalized_name = ?').get(item.normalizedName);
      upsertItem.run(item);
      const row = db.prepare('SELECT id FROM menu_items WHERE normalized_name = ?').get(item.normalizedName);
      upsertDaily.run({ menu_item_id: row.id, date: today });

      if (!existing) result.new_items.push(item.name);
      else result.available.push(item.name);

      // Upsert addons for this item
      const itemAddons = addons[item.normalizedName] || [];
      for (const a of itemAddons) upsertAddon.run(row.id, a.name, a.price);
    }

    // Get names of items being turned off
    const todayItems = db.prepare('SELECT mi.name FROM daily_menu dm JOIN menu_items mi ON mi.id = dm.menu_item_id WHERE dm.date = ? AND dm.is_available = 1').all(today);
    const availableNames = new Set(items.map(i => i.name));
    result.unavailable = todayItems.map(r => r.name).filter(n => !availableNames.has(n));

    // Disable items not in today's menu
    const availableIds = items.map(i => db.prepare('SELECT id FROM menu_items WHERE normalized_name = ?').get(i.normalizedName)?.id).filter(Boolean);
    if (availableIds.length > 0) {
      db.prepare(`UPDATE daily_menu SET is_available = 0 WHERE date = ? AND menu_item_id NOT IN (${availableIds.map(() => '?').join(',')})`).run(today, ...availableIds);
    }

    return result;
  });

  const result = importAll();
  res.json(result);
});

// POST /api/menu/lock
menuRouter.post('/lock', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE daily_menu SET is_locked = 1 WHERE date = ?').run(today);
  broadcast('order_locked', { date: today });
  res.json({ locked: true, date: today });
});
```

- [ ] **Step 4: Start server and verify menu endpoint**

```bash
cd /home/azureuser/aiq/lunch-time
node server/index.js &
curl http://localhost:3001/api/menu/today
```
Expected: `{"items":[],"is_locked":false}` (empty until menu imported)

- [ ] **Step 5: Kill dev server and commit**

```bash
kill %1
git add server/index.js server/src/routes/menu.js server/src/routes/events.js
git commit -m "feat: Express app + menu routes (today/import/lock) + SSE events endpoint"
```

---

## Task 7: Orders Routes

**Files:**
- Create: `server/src/routes/orders.js`
- Create: `server/src/cron.js`

- [ ] **Step 1: Write orders route**

```js
// server/src/routes/orders.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { broadcast } from '../services/sse.js';

export const ordersRouter = Router();

// GET /api/orders/today
ordersRouter.get('/today', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const orders = db.prepare(`
    SELECT o.id, o.person_name, mi.name as item_name, mi.price,
           GROUP_CONCAT(ma.name) as addon_names,
           GROUP_CONCAT(ma.price) as addon_prices
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    WHERE o.date = ?
    GROUP BY o.id
    ORDER BY o.created_at
  `).all(today);

  const isLocked = db.prepare('SELECT is_locked FROM daily_menu WHERE date = ? LIMIT 1').get(today)?.is_locked === 1;

  res.json({ orders, is_locked: isLocked, date: today });
});

// POST /api/orders
ordersRouter.post('/', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const { person_name, menu_item_id, addon_ids = [] } = req.body;

  if (!person_name || !menu_item_id) {
    return res.status(400).json({ error: 'person_name and menu_item_id required' });
  }

  const isLocked = db.prepare('SELECT is_locked FROM daily_menu WHERE date = ? LIMIT 1').get(today)?.is_locked === 1;
  if (isLocked) return res.status(409).json({ error: 'Orders are locked for today' });

  const submit = db.transaction(() => {
    // Replace existing order for this person today
    const existing = db.prepare('SELECT id FROM orders WHERE person_name = ? AND date = ?').get(person_name, today);
    if (existing) {
      db.prepare('DELETE FROM order_addons WHERE order_id = ?').run(existing.id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(existing.id);
    }

    const { lastInsertRowid } = db.prepare(
      'INSERT INTO orders (person_name, menu_item_id, date) VALUES (?, ?, ?)'
    ).run(person_name, menu_item_id, today);

    for (const addon_id of addon_ids) {
      db.prepare('INSERT INTO order_addons (order_id, addon_id) VALUES (?, ?)').run(lastInsertRowid, addon_id);
    }

    return lastInsertRowid;
  });

  const orderId = submit();

  // Fetch full order to broadcast
  const order = db.prepare(`
    SELECT o.id, o.person_name, mi.name as item_name, mi.price,
           GROUP_CONCAT(ma.name) as addon_names
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    WHERE o.id = ?
    GROUP BY o.id
  `).get(orderId);

  broadcast('order_submitted', { order, date: today });
  res.status(201).json(order);
});
```

- [ ] **Step 2: Write cron.js**

```js
// server/src/cron.js
import cron from 'node-cron';
import { getDb } from './db/index.js';
import { broadcast } from './services/sse.js';

export function startCron() {
  // Auto-lock at 11:00 AM every weekday
  cron.schedule('0 11 * * 1-5', () => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('UPDATE daily_menu SET is_locked = 1 WHERE date = ?').run(today);
    broadcast('order_locked', { date: today, reason: 'auto' });
    console.log(`[cron] Orders locked for ${today}`);
  }, { timezone: 'Asia/Ho_Chi_Minh' });
}
```

- [ ] **Step 3: Test order submission manually**

```bash
cd /home/azureuser/aiq/lunch-time
node server/index.js &
# First import a menu so there's something to order
curl -X POST http://localhost:3001/api/menu/import \
  -H "Content-Type: application/json" \
  -d '{"text":"- Cơm gà mắm tỏi 35k\n- Cơm sườn: 30k\n+ bì || chả: 5k/phần"}'
# Get menu to find item ID
curl http://localhost:3001/api/menu/today
# Submit order (replace 1 with actual menu_item_id from above)
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"person_name":"An","menu_item_id":1,"addon_ids":[]}'
```
Expected: `{"id":1,"person_name":"An","item_name":"Cơm gà mắm tỏi",...}`

- [ ] **Step 4: Kill dev server and commit**

```bash
kill %1
git add server/src/routes/orders.js server/src/cron.js
git commit -m "feat: orders routes (GET today, POST submit) + cron auto-lock 11:00"
```

---

## Task 8: Debts Route + SePay Webhook (TDD)

**Files:**
- Create: `server/src/routes/debts.js`
- Create: `server/src/routes/webhook.js`
- Create: `server/tests/webhook.test.js`

- [ ] **Step 1: Write debts route**

```js
// server/src/routes/debts.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getWeekNumber } from '../services/debtCalculator.js';

export const debtsRouter = Router();

// GET /api/debts?week=17&year=2026
debtsRouter.get('/', (req, res) => {
  const db = getDb();
  const week = parseInt(req.query.week) || getWeekNumber(new Date().toISOString().slice(0, 10));
  const year = parseInt(req.query.year) || new Date().getFullYear();

  // Get all dates in this week (Mon–Fri)
  const orders = db.prepare(`
    SELECT o.person_name,
           mi.price + COALESCE(SUM(ma.price), 0) as total_price,
           o.date
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    GROUP BY o.id
  `).all();

  // Filter to this week
  const weekOrders = orders.filter(o => {
    const d = new Date(o.date);
    return getWeekNumber(o.date) === week && d.getFullYear() === year;
  });

  // Sum per person
  const debtMap = {};
  for (const o of weekOrders) {
    debtMap[o.person_name] = (debtMap[o.person_name] || 0) + o.total_price;
  }

  // Merge with payment status
  const payments = db.prepare('SELECT * FROM payments WHERE week_number = ? AND year = ?').all(week, year);
  const paymentByPerson = Object.fromEntries(payments.map(p => [p.person_name, p]));

  const debts = Object.entries(debtMap).map(([person_name, amount]) => ({
    person_name,
    amount,
    status: paymentByPerson[person_name]?.status || 'pending',
    paid_at: paymentByPerson[person_name]?.paid_at || null,
    sepay_ref: paymentByPerson[person_name]?.sepay_ref || null,
  }));

  res.json({ week, year, debts });
});
```

- [ ] **Step 2: Write webhook test**

```js
// server/tests/webhook.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { parseSePayContent } from '../src/routes/webhook.js';

describe('parseSePayContent', () => {
  it('extracts week and person name from transfer content', () => {
    expect(parseSePayContent('LUNCH TUAN 17 CHI')).toEqual({ week: 17, personName: 'Chi' });
    expect(parseSePayContent('lunch tuan 3 nguyen van an')).toEqual({ week: 3, personName: 'Nguyen Van An' });
  });

  it('returns null for non-matching content', () => {
    expect(parseSePayContent('CHUYEN TIEN THANG 4')).toBeNull();
    expect(parseSePayContent('')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify fail**

```bash
cd /home/azureuser/aiq/lunch-time/server
npm test -- tests/webhook.test.js
```
Expected: FAIL

- [ ] **Step 4: Write webhook route with exported parseSePayContent**

```js
// server/src/routes/webhook.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { broadcast } from '../services/sse.js';
import { getWeekNumber } from '../services/debtCalculator.js';

export const webhookRouter = Router();

export function parseSePayContent(content) {
  if (!content) return null;
  // Matches: "lunch tuan 17 chi" or "LUNCH TUAN 17 NGUYEN VAN AN"
  const match = content.trim().match(/^lunch\s+tuan\s+(\d+)\s+(.+)$/i);
  if (!match) return null;
  const week = parseInt(match[1]);
  const personName = match[2].trim().replace(/\b\w/g, c => c.toUpperCase());
  return { week, personName };
}

// POST /api/webhook/sepay
// SePay payload: { content, transferAmount, transactionDate, referenceCode, ... }
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
```

- [ ] **Step 5: Run webhook tests to verify pass**

```bash
cd /home/azureuser/aiq/lunch-time/server
npm test -- tests/webhook.test.js
```
Expected: all PASS

- [ ] **Step 6: Run all server tests**

```bash
cd /home/azureuser/aiq/lunch-time/server
npm test
```
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/debts.js server/src/routes/webhook.js server/tests/webhook.test.js
git commit -m "feat: debts route + SePay webhook handler with parseSePayContent (TDD)"
```

---

## Task 9: React App Shell + API Client + SSE Hook

**Files:**
- Create: `client/src/lib/api.js`
- Create: `client/src/hooks/useSSE.js`
- Create: `client/src/components/Layout.jsx`
- Create: `client/src/components/Sidebar.jsx`
- Create: `client/src/App.jsx`
- Modify: `client/src/main.jsx`

- [ ] **Step 1: Write api.js**

```js
// client/src/lib/api.js
const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

export const api = {
  getMenuToday: () => request('GET', '/menu/today'),
  importMenu: (text) => request('POST', '/menu/import', { text }),
  lockMenu: () => request('POST', '/menu/lock'),
  getOrdersToday: () => request('GET', '/orders/today'),
  submitOrder: (body) => request('POST', '/orders', body),
  getDebts: (week, year) => request('GET', `/debts?week=${week}&year=${year}`),
};
```

- [ ] **Step 2: Write useSSE.js**

```js
// client/src/hooks/useSSE.js
import { useEffect } from 'react';

// handlers: { order_submitted: (data) => {}, order_locked: (data) => {}, payment_confirmed: (data) => {} }
export function useSSE(handlers) {
  useEffect(() => {
    const es = new EventSource('/api/events');
    const subs = Object.entries(handlers).map(([event, handler]) => {
      es.addEventListener(event, (e) => handler(JSON.parse(e.data)));
      return event;
    });
    return () => es.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
```

- [ ] **Step 3: Write Sidebar.jsx**

```jsx
// client/src/components/Sidebar.jsx
const NAV = [
  { id: 'order', icon: '🍱', label: 'Order hôm nay' },
  { id: 'import', icon: '📥', label: 'Import menu' },
  { id: 'summary', icon: '📋', label: 'Tổng hợp đơn' },
  { id: 'debt', icon: '💰', label: 'Công nợ' },
];

export function Sidebar({ current, onNavigate, weekLabel }) {
  return (
    <aside style={{
      width: 200, flexShrink: 0,
      background: 'linear-gradient(180deg,#fce7f3 0%,#ede9fe 100%)',
      padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4,
      borderRight: '1px solid rgba(255,255,255,0.6)',
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, padding: '0 4px', background: 'linear-gradient(135deg,#ec4899,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        🍱 LunchTime
      </div>
      {NAV.map(item => (
        <button key={item.id} onClick={() => onNavigate(item.id)} style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 11px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: current === item.id ? 700 : 500,
          background: current === item.id ? '#fff' : 'transparent',
          color: current === item.id ? '#ec4899' : '#7c6f8e',
          boxShadow: current === item.id ? '0 2px 8px rgba(236,72,153,0.1)' : 'none',
          width: '100%', textAlign: 'left',
        }}>
          <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: '9px 11px', fontSize: 11, color: '#7c6f8e' }}>
        <strong style={{ display: 'block', color: '#ec4899', fontSize: 12, marginBottom: 2 }}>{weekLabel}</strong>
        Tuần hiện tại
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Write Layout.jsx**

```jsx
// client/src/components/Layout.jsx
export function Layout({ children }) {
  return (
    <div style={{
      display: 'flex', height: '100vh', background: '#fff',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      color: '#2d2d3a', overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Write App.jsx**

```jsx
// client/src/App.jsx
import { useState } from 'react';
import { Layout } from './components/Layout.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { OrderPage } from './pages/OrderPage.jsx';
import { ImportMenuPage } from './pages/ImportMenuPage.jsx';
import { SummaryPage } from './pages/SummaryPage.jsx';
import { DebtPage } from './pages/DebtPage.jsx';

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `Tuần ${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

const PAGES = { order: OrderPage, import: ImportMenuPage, summary: SummaryPage, debt: DebtPage };

export default function App() {
  const [page, setPage] = useState('order');
  const Page = PAGES[page];
  return (
    <Layout>
      <Sidebar current={page} onNavigate={setPage} weekLabel={getWeekLabel()} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fdf8ff' }}>
        <Page />
      </main>
    </Layout>
  );
}
```

- [ ] **Step 6: Update main.jsx**

```jsx
// client/src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 7: Replace client/src/index.css with minimal reset**

```css
/* client/src/index.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
button { font-family: inherit; }
input, textarea { font-family: inherit; }
```

- [ ] **Step 8: Create placeholder pages so app boots**

Create these 4 files (they'll be replaced in later tasks):

```jsx
// client/src/pages/OrderPage.jsx
export function OrderPage() { return <div style={{padding:24}}>Order Page — coming soon</div>; }

// client/src/pages/ImportMenuPage.jsx
export function ImportMenuPage() { return <div style={{padding:24}}>Import Menu — coming soon</div>; }

// client/src/pages/SummaryPage.jsx
export function SummaryPage() { return <div style={{padding:24}}>Summary — coming soon</div>; }

// client/src/pages/DebtPage.jsx
export function DebtPage() { return <div style={{padding:24}}>Debt — coming soon</div>; }
```

- [ ] **Step 9: Boot both services and verify app loads**

```bash
# Terminal 1
cd /home/azureuser/aiq/lunch-time && node server/index.js

# Terminal 2
cd /home/azureuser/aiq/lunch-time/client && npm run dev
```
Open http://localhost:5173 — should see sidebar + "Order Page — coming soon"

- [ ] **Step 10: Commit**

```bash
git add client/src/
git commit -m "feat: React app shell — sidebar navigation, SSE hook, api client, layout"
```

---

## Task 10: Order Page

**Files:**
- Create: `client/src/components/NameSelector.jsx`
- Create: `client/src/components/MenuList.jsx`
- Modify: `client/src/pages/OrderPage.jsx`

- [ ] **Step 1: Write NameSelector.jsx**

```jsx
// client/src/components/NameSelector.jsx
import { useState } from 'react';

export function NameSelector({ names, selected, onSelect }) {
  const [showInput, setShowInput] = useState(false);
  const [newName, setNewName] = useState('');

  function handleNewName(e) {
    e.preventDefault();
    if (newName.trim()) {
      onSelect(newName.trim());
      setNewName('');
      setShowInput(false);
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 10 }}>
        Bạn là ai?
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {names.map(name => (
          <button key={name} onClick={() => onSelect(name)} style={{
            padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
            borderColor: selected === name ? 'transparent' : '#e0d6f0',
            background: selected === name ? 'linear-gradient(135deg,#f9a8d4,#c084fc)' : '#fff',
            color: selected === name ? '#fff' : '#7c6f8e',
            boxShadow: selected === name ? '0 2px 8px rgba(192,132,252,0.3)' : 'none',
          }}>
            {name}
          </button>
        ))}
        {!showInput ? (
          <button onClick={() => setShowInput(true)} style={{ padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px dashed #c084fc', background: '#fff', color: '#c084fc' }}>
            + Tên mới
          </button>
        ) : (
          <form onSubmit={handleNewName} style={{ display: 'flex', gap: 6 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nhập tên..." style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid #c084fc', fontSize: 13, outline: 'none', width: 120 }} />
            <button type="submit" style={{ padding: '6px 12px', borderRadius: 20, background: 'linear-gradient(135deg,#f9a8d4,#c084fc)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>OK</button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write MenuList.jsx**

```jsx
// client/src/components/MenuList.jsx

function AddonWidget({ addons, selectedAddonIds, onToggleAddon }) {
  if (!addons?.length) return null;
  return (
    <div style={{ margin: '4px 0 6px 44px', background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', borderRadius: 10, padding: '9px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#a855f7', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>➕ Gọi thêm</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {addons.map(a => (
          <button key={a.id} onClick={() => onToggleAddon(a.id)} style={{
            padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
            borderColor: selectedAddonIds.includes(a.id) ? 'transparent' : '#e0d6f0',
            background: selectedAddonIds.includes(a.id) ? 'linear-gradient(135deg,#f9a8d4,#c084fc)' : '#fff',
            color: selectedAddonIds.includes(a.id) ? '#fff' : '#7c6f8e',
          }}>
            {selectedAddonIds.includes(a.id) ? '✓ ' : ''}{a.name} +{a.price / 1000}k
          </button>
        ))}
      </div>
    </div>
  );
}

export function MenuList({ items, selectedItemId, selectedAddonIds, onSelectItem, onToggleAddon }) {
  const categories = [
    { id: 'main', label: '🍚 Cơm' },
    { id: 'extra', label: '➕ Gọi thêm' },
  ];

  // Group by category
  const byCategory = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 12 }}>
        Menu hôm nay
      </div>
      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#bbb', letterSpacing: 1, margin: '10px 0 6px', paddingLeft: 2 }}>
            {categories.find(c => c.id === cat)?.label || cat}
          </div>
          {catItems.map(item => (
            <div key={item.id}>
              <div onClick={() => onSelectItem(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 10, cursor: 'pointer', border: '1.5px solid',
                borderColor: selectedItemId === item.id ? '#f9a8d4' : 'transparent',
                background: selectedItemId === item.id ? '#fdf0f8' : 'transparent',
                transition: 'all 0.15s',
              }}>
                <div style={{
                  width: 21, height: 21, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                  background: selectedItemId === item.id ? 'linear-gradient(135deg,#f9a8d4,#c084fc)' : 'none',
                  border: selectedItemId === item.id ? 'none' : '2px solid #e0d6f0',
                  color: selectedItemId === item.id ? '#fff' : 'transparent',
                }}>
                  {selectedItemId === item.id ? '✓' : ''}
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: selectedItemId === item.id ? '#ec4899' : '#bbb' }}>
                  {(item.price / 1000).toFixed(0)}k
                </div>
              </div>
              {selectedItemId === item.id && (
                <AddonWidget addons={item.addons} selectedAddonIds={selectedAddonIds} onToggleAddon={onToggleAddon} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write full OrderPage.jsx**

```jsx
// client/src/pages/OrderPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { NameSelector } from '../components/NameSelector.jsx';
import { MenuList } from '../components/MenuList.jsx';

function getKnownNames(orders) {
  const set = new Set(orders.map(o => o.person_name));
  return [...set];
}

export function OrderPage() {
  const [menu, setMenu] = useState({ items: [], is_locked: false });
  const [orders, setOrders] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [knownNames, setKnownNames] = useState([]);

  useEffect(() => {
    api.getMenuToday().then(setMenu);
    api.getOrdersToday().then(d => {
      setOrders(d.orders);
      setKnownNames(getKnownNames(d.orders));
    });
  }, []);

  useSSE({
    order_submitted: ({ order }) => setOrders(prev => {
      const filtered = prev.filter(o => o.person_name !== order.person_name);
      return [...filtered, order];
    }),
    order_locked: () => setMenu(m => ({ ...m, is_locked: true })),
  });

  function handleSelectItem(id) {
    setSelectedItemId(id);
    setSelectedAddonIds([]);
  }

  function handleToggleAddon(id) {
    setSelectedAddonIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSubmit() {
    if (!selectedName || !selectedItemId) return;
    setSubmitting(true);
    try {
      await api.submitOrder({ person_name: selectedName, menu_item_id: selectedItemId, addon_ids: selectedAddonIds });
      if (!knownNames.includes(selectedName)) setKnownNames(n => [...n, selectedName]);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedItem = menu.items.find(i => i.id === selectedItemId);
  const totalPrice = selectedItem
    ? selectedItem.price + selectedAddonIds.reduce((sum, id) => {
        const addon = selectedItem.addons?.find(a => a.id === id);
        return sum + (addon?.price || 0);
      }, 0)
    : 0;

  const orderedNames = new Set(orders.map(o => o.person_name));
  const allNames = [...new Set([...knownNames, ...orderedNames])];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #f5f0fb', background: '#fff', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Order hôm nay</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {menu.is_locked
            ? <span style={{ background: '#fce7f3', color: '#e11d48', padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>🔒 Đã chốt</span>
            : <span style={{ background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', color: '#a855f7', padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>⏳ Đang mở</span>
          }
          {!menu.is_locked && (
            <button onClick={() => api.lockMenu()} style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#fca5a5,#f472b6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔒 Chốt đơn
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignContent: 'start' }}>
        <div>
          <NameSelector names={allNames} selected={selectedName} onSelect={setSelectedName} />
          {menu.items.length === 0
            ? <div style={{ background: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', color: '#bbb', boxShadow: '0 2px 8px rgba(180,140,220,0.07)' }}>
                Chưa có menu hôm nay — vào <strong>Import Menu</strong> để thêm
              </div>
            : <MenuList items={menu.items} selectedItemId={selectedItemId} selectedAddonIds={selectedAddonIds} onSelectItem={handleSelectItem} onToggleAddon={handleToggleAddon} />
          }
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* My order */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 10 }}>Order của bạn</div>
            <div style={{ background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, marginBottom: 4 }}>ĐANG CHỌN</div>
              {selectedItem
                ? <>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedItem.name}</div>
                    {selectedAddonIds.length > 0 && <div style={{ fontSize: 11, color: '#a855f7', marginTop: 2 }}>+ {selectedAddonIds.map(id => selectedItem.addons?.find(a => a.id === id)?.name).join(', ')}</div>}
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#ec4899', margin: '6px 0 12px' }}>{(totalPrice / 1000).toFixed(0)},000đ</div>
                  </>
                : <div style={{ fontSize: 13, color: '#ccc', margin: '8px 0 12px' }}>Chưa chọn món</div>
              }
              <button onClick={handleSubmit} disabled={!selectedName || !selectedItemId || submitting || menu.is_locked} style={{
                width: '100%', padding: 11, borderRadius: 12, border: 'none',
                background: selectedName && selectedItemId && !menu.is_locked ? 'linear-gradient(135deg,#f9a8d4,#c084fc)' : '#e0d6f0',
                color: selectedName && selectedItemId && !menu.is_locked ? '#fff' : '#bbb',
                fontSize: 13, fontWeight: 700, cursor: selectedName && selectedItemId && !menu.is_locked ? 'pointer' : 'not-allowed',
                boxShadow: selectedName && selectedItemId ? '0 4px 14px rgba(192,132,252,0.35)' : 'none',
              }}>
                {submitting ? 'Đang lưu...' : 'Xác nhận order ✓'}
              </button>
            </div>
          </div>

          {/* Who ordered */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 10 }}>
              Đã order ({orders.length}/{allNames.length || '?'})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {orders.map(o => (
                <span key={o.id} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#d1fae5', color: '#059669' }}>
                  {o.person_name} ✓
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Start both services and verify Order page works end-to-end**

```bash
# Terminal 1: node server/index.js
# Terminal 2: cd client && npm run dev
# Open http://localhost:5173
# 1. Go to Import Menu, paste menu text, click Phân tích → Xác nhận
# 2. Go to Order page — menu should appear
# 3. Select name chip, select item, submit — verify "Đã order" updates in realtime
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/NameSelector.jsx client/src/components/MenuList.jsx client/src/pages/OrderPage.jsx
git commit -m "feat: Order page — name chip selector, menu list, inline addons, realtime updates"
```

---

## Task 11: Import Menu Page

**Files:**
- Modify: `client/src/pages/ImportMenuPage.jsx`

- [ ] **Step 1: Write ImportMenuPage.jsx**

```jsx
// client/src/pages/ImportMenuPage.jsx
import { useState } from 'react';
import { api } from '../lib/api.js';

export function ImportMenuPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const r = await api.importMenu(text);
      setResult(r);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    try {
      await api.importMenu(text); // idempotent — apply the parsed state
      setDone(true);
    } finally {
      setConfirming(false);
    }
  }

  const TAG_STYLES = {
    new: { background: '#dbeafe', color: '#2563eb' },
    on: { background: '#d1fae5', color: '#059669' },
    off: { background: '#f3f4f6', color: '#bbb' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #f5f0fb', background: '#fff', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Import Menu</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>Dán menu từ Zalo — app tự parse và cập nhật</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start' }}>
        {/* Left: paste area */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 8 }}>Paste menu Zalo</div>
          <textarea value={text} onChange={e => { setText(e.target.value); setResult(null); setDone(false); }}
            placeholder="@All&#10;- Cơm gà mắm tỏi: 35k&#10;- Cơm sườn: 30k&#10;+ bì || chả: 5k/phần&#10;..."
            style={{ width: '100%', height: 240, borderRadius: 12, border: '1.5px solid #e0d6f0', background: '#fdf8ff', padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#2d2d3a', resize: 'none', outline: 'none', lineHeight: 1.7 }}
          />
          <button onClick={handleParse} disabled={parsing || !text.trim()} style={{
            width: '100%', padding: 11, borderRadius: 12, border: 'none', marginTop: 10,
            background: text.trim() ? 'linear-gradient(135deg,#93c5fd,#c084fc)' : '#e0d6f0',
            color: text.trim() ? '#fff' : '#bbb', fontSize: 13, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'not-allowed',
          }}>
            {parsing ? '⏳ Đang phân tích...' : '🔍 Phân tích menu'}
          </button>
        </div>

        {/* Right: diff result */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(180,140,220,0.07)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 14 }}>Thay đổi hôm nay</div>

          {!result && <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Paste menu và bấm Phân tích để xem thay đổi</div>}

          {result && (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {result.new_items?.map(name => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f0fb' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{name}</div>
                    <span style={{ ...TAG_STYLES.new, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Mới</span>
                  </div>
                ))}
                {result.available?.map(name => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f0fb' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{name}</div>
                    <span style={{ ...TAG_STYLES.on, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Có</span>
                  </div>
                ))}
                {result.unavailable?.map(name => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f0fb' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#ccc', textDecoration: 'line-through' }}>{name}</div>
                    <span style={{ ...TAG_STYLES.off, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Không có</span>
                  </div>
                ))}
              </div>

              {done
                ? <div style={{ background: '#d1fae5', color: '#059669', borderRadius: 12, padding: '12px', textAlign: 'center', fontSize: 14, fontWeight: 700, marginTop: 14 }}>✓ Menu đã cập nhật — Order đang mở!</div>
                : <button onClick={handleConfirm} disabled={confirming} style={{
                    width: '100%', padding: 12, borderRadius: 12, border: 'none', marginTop: 14,
                    background: 'linear-gradient(135deg,#a7f3d0,#6ee7b7)', color: '#065f46', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {confirming ? 'Đang lưu...' : '✓ Xác nhận — Mở order hôm nay'}
                  </button>
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test import end-to-end**

```
1. Open http://localhost:5173 → Import Menu
2. Paste the full sample menu text from the spec
3. Click Phân tích — verify diff appears (new/có/không có)
4. Click Xác nhận — verify success message
5. Switch to Order page — verify menu items appear
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ImportMenuPage.jsx
git commit -m "feat: Import Menu page — paste & parse Zalo text, diff preview, confirm"
```

---

## Task 12: Summary Page

**Files:**
- Modify: `client/src/pages/SummaryPage.jsx`

- [ ] **Step 1: Write SummaryPage.jsx**

```jsx
// client/src/pages/SummaryPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';

function buildZaloText(orders, date) {
  // Group by item name
  const groups = {};
  for (const o of orders) {
    const key = o.addon_names ? `${o.item_name}+${o.addon_names}` : o.item_name;
    if (!groups[key]) groups[key] = { label: o.addon_names ? `${o.item_name} + ${o.addon_names}` : o.item_name, people: [], unitPrice: o.price };
    groups[key].people.push(o.person_name);
  }
  const total = orders.reduce((sum, o) => sum + o.price, 0);
  const d = new Date(date);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const lines = [`📋 ORDER ${dateStr}`];
  for (const g of Object.values(groups)) {
    const count = g.people.length > 1 ? ` (×${g.people.length})` : '';
    lines.push(`- ${g.label}: ${g.people.join(', ')}${count}`);
  }
  lines.push(`💰 Tổng: ${total / 1000}k`);
  return lines.join('\n');
}

const DOT_COLORS = ['#f472b6', '#c084fc', '#93c5fd', '#6ee7b7', '#fbbf24', '#f87171'];

export function SummaryPage() {
  const [data, setData] = useState({ orders: [], is_locked: false, date: '' });

  useEffect(() => { api.getOrdersToday().then(setData); }, []);
  useSSE({
    order_submitted: () => api.getOrdersToday().then(setData),
    order_locked: () => setData(d => ({ ...d, is_locked: true })),
  });

  // Group orders by item
  const groups = {};
  for (const o of data.orders) {
    const key = o.addon_names ? `${o.item_name}+${o.addon_names}` : o.item_name;
    if (!groups[key]) groups[key] = { label: o.addon_names ? `${o.item_name} + ${o.addon_names}` : o.item_name, people: [], total: 0 };
    groups[key].people.push(o.person_name);
    groups[key].total += o.price || 0;
  }
  const groupList = Object.values(groups);
  const grandTotal = data.orders.reduce((sum, o) => sum + (o.price || 0), 0);
  const zaloText = buildZaloText(data.orders, data.date || new Date().toISOString());

  async function handleCopy() {
    await navigator.clipboard.writeText(zaloText);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #f5f0fb', background: '#fff', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Tổng hợp đơn</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>{data.orders.length} người đã order</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!data.is_locked && (
            <button onClick={() => api.lockMenu().then(() => setData(d => ({ ...d, is_locked: true })))}
              style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#fca5a5,#f472b6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔒 Chốt đơn
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 260px', gap: 14, alignContent: 'start' }}>
        <div>
          {/* Total card */}
          <div style={{ background: 'linear-gradient(135deg,#f9a8d4 0%,#c084fc 50%,#93c5fd 100%)', borderRadius: 14, padding: 18, color: '#fff', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 3 }}>Tổng hôm nay</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1 }}>{(grandTotal / 1000).toFixed(0)},000đ</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{data.orders.length} người · {groupList.length} món</div>
            </div>
            <div style={{ fontSize: 48, opacity: 0.2 }}>💰</div>
          </div>

          {/* Order rows */}
          {groupList.map((g, i) => (
            <div key={g.label} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 11, background: '#fff', marginBottom: 7, boxShadow: '0 1px 4px rgba(180,140,220,0.07)', gap: 10 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: DOT_COLORS[i % DOT_COLORS.length], flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{g.label}</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>{g.people.join(', ')} · ×{g.people.length}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ec4899' }}>{(g.total / 1000).toFixed(0)}k</div>
            </div>
          ))}
        </div>

        {/* Right: Zalo copy */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc' }}>Text gửi Zalo</div>
          <pre style={{ background: '#1e1e2e', borderRadius: 12, padding: 13, fontFamily: 'monospace', fontSize: 12, color: '#a0e0a0', lineHeight: 1.8, whiteSpace: 'pre-wrap', flex: 1 }}>{zaloText}</pre>
          <button onClick={handleCopy} style={{ padding: 11, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#a7f3d0,#6ee7b7)', color: '#065f46', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            📋 Copy gửi Zalo
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify Zalo text format**

```
1. Submit 2-3 test orders via the Order page
2. Switch to Tổng hợp — verify orders appear grouped by item
3. Click Copy gửi Zalo — paste into a text editor and verify format matches spec
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/SummaryPage.jsx
git commit -m "feat: Summary page — grouped orders, Zalo copy text, realtime updates"
```

---

## Task 13: Debt Page + QR Modal

**Files:**
- Create: `client/src/components/QRModal.jsx`
- Modify: `client/src/pages/DebtPage.jsx`

- [ ] **Step 1: Write QRModal.jsx**

Configure `VITE_BANK_CODE` and `VITE_BANK_ACCOUNT` as env vars (see Step 2).

```jsx
// client/src/components/QRModal.jsx

const BANK_CODE = import.meta.env.VITE_BANK_CODE || 'MB';
const BANK_ACCOUNT = import.meta.env.VITE_BANK_ACCOUNT || '123456789';
const ACCOUNT_NAME = import.meta.env.VITE_ACCOUNT_NAME || 'LUNCH TEAM';

function buildQRUrl(amount, content) {
  const base = `https://img.vietqr.io/image/${BANK_CODE}-${BANK_ACCOUNT}-compact2.png`;
  return `${base}?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
}

export function QRModal({ person, amount, week, year, onClose }) {
  const content = `Lunch Tuan ${week} ${person}`;
  const qrUrl = buildQRUrl(amount, content);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,20,50,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 20px 60px rgba(180,140,220,0.35)', width: 340, textAlign: 'center', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, fontSize: 20, cursor: 'pointer', color: '#ccc', background: 'none', border: 'none', lineHeight: 1 }}>✕</button>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{person}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 18 }}>Quét QR để chuyển khoản</div>
        <img src={qrUrl} alt="VietQR" style={{ width: 200, height: 200, borderRadius: 16, border: '3px solid #ede9fe', display: 'block', margin: '0 auto 16px', boxShadow: '0 4px 16px rgba(180,140,220,0.15)' }} />
        <div style={{ fontSize: 28, fontWeight: 800, color: '#ec4899', marginBottom: 6 }}>{(amount / 1000).toFixed(0)},000đ</div>
        <div style={{ display: 'inline-block', background: '#f5f0fb', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: 'monospace', color: '#7c6f8e', marginBottom: 16, fontWeight: 600 }}>{content}</div>
        <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5 }}>
          Mở app ngân hàng → quét QR<br />
          Số tiền & nội dung điền <strong style={{ color: '#a855f7' }}>tự động</strong><br />
          <strong style={{ color: '#a855f7' }}>SePay</strong> tự xác nhận sau khi nhận tiền
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 700, color: '#a855f7', marginTop: 12 }}>
          ⚡ Powered by SePay
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create client/.env with bank config**

```bash
cat > /home/azureuser/aiq/lunch-time/client/.env << 'EOF'
VITE_BANK_CODE=MB
VITE_BANK_ACCOUNT=YOUR_ACCOUNT_NUMBER_HERE
VITE_ACCOUNT_NAME=LUNCH TEAM
EOF
```
Edit `VITE_BANK_ACCOUNT` with the actual account number.

Add to `.gitignore`:
```
client/.env
```

- [ ] **Step 3: Write DebtPage.jsx**

```jsx
// client/src/pages/DebtPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { QRModal } from '../components/QRModal.jsx';

function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.floor((d - startOfWeek1) / (7 * 86400000)) + 1;
}

export function DebtPage() {
  const currentWeek = getWeekNumber();
  const currentYear = new Date().getFullYear();
  const [week, setWeek] = useState(currentWeek);
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState({ debts: [] });
  const [qrPerson, setQrPerson] = useState(null);

  useEffect(() => { api.getDebts(week, year).then(setData); }, [week, year]);

  useSSE({
    payment_confirmed: ({ person_name, week: w, year: y }) => {
      if (w === week && y === year) {
        setData(d => ({
          ...d,
          debts: d.debts.map(debt =>
            debt.person_name === person_name ? { ...debt, status: 'paid' } : debt
          ),
        }));
        // Auto-close QR modal if it was open for this person
        setQrPerson(p => p?.person === person_name ? null : p);
      }
    },
  });

  const totalAmount = data.debts.reduce((s, d) => s + d.amount, 0);
  const paidAmount = data.debts.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #f5f0fb', background: '#fff', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Công nợ</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>SePay tự xác nhận khi nhận đúng nội dung</div>
        </div>
        <div style={{ background: '#d1fae5', color: '#059669', padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
          Đã thu: {(paidAmount / 1000).toFixed(0)}k / {(totalAmount / 1000).toFixed(0)}k
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
        {/* Week nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => setWeek(w => w - 1)} style={{ fontSize: 18, color: '#c084fc', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}>‹</button>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Tuần {week}</span>
            <span style={{ fontSize: 12, color: '#aaa', marginLeft: 3 }}> · {year}</span>
          </div>
          <button onClick={() => setWeek(w => Math.min(w + 1, week <= currentWeek ? w + 1 : w))} style={{ fontSize: 18, color: '#c084fc', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}>›</button>
        </div>

        {/* Debt list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.debts.map(d => (
            <div key={d.person_name} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(180,140,220,0.07)', border: '1.5px solid', borderColor: d.status === 'paid' ? '#a7f3d0' : '#f9a8d4', display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Avatar */}
              <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', background: d.status === 'paid' ? 'linear-gradient(135deg,#6ee7b7,#10b981)' : 'linear-gradient(135deg,#f9a8d4,#c084fc)' }}>
                {d.person_name[0].toUpperCase()}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{d.person_name}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>
                  {d.status === 'paid' ? `SePay · ${d.paid_at ? new Date(d.paid_at).toLocaleDateString('vi-VN') : ''}` : `Chưa thanh toán · Tuần ${week}`}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: d.status === 'paid' ? '#059669' : '#ec4899' }}>
                  {(d.amount / 1000).toFixed(0)}k
                </div>
                {d.status === 'paid'
                  ? <span style={{ background: '#d1fae5', color: '#059669', padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>✓ Đã trả</span>
                  : <button onClick={() => setQrPerson({ person: d.person_name, amount: d.amount })} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#93c5fd,#818cf8)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      📲 Hiện QR
                    </button>
                }
              </div>
            </div>
          ))}
          {data.debts.length === 0 && (
            <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, marginTop: 40 }}>Chưa có đơn nào tuần này</div>
          )}
        </div>
      </div>

      {qrPerson && (
        <QRModal person={qrPerson.person} amount={qrPerson.amount} week={week} year={year} onClose={() => setQrPerson(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Test QR modal and realtime payment confirmation**

```bash
# 1. Make sure some orders exist for current week
# 2. Open Công nợ page — verify debt cards appear
# 3. Click Hiện QR on an unpaid person — verify modal opens with QR image
# 4. Simulate SePay webhook:
curl -X POST http://localhost:3001/api/webhook/sepay \
  -H "Content-Type: application/json" \
  -d '{"content":"LUNCH TUAN 17 CHI","transferAmount":160000,"transactionDate":"2026-04-21 10:00:00","referenceCode":"TEST001"}'
# 5. Verify: debt card turns green instantly, QR modal closes automatically
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/QRModal.jsx client/src/pages/DebtPage.jsx client/.env
git commit -m "feat: Debt page + QR modal — VietQR, SePay realtime auto-confirm"
```

---

## Task 14: Deployment Config

**Files:**
- Create: `ecosystem.config.js`
- Create: `nginx.conf`

- [ ] **Step 1: Build client for production**

```bash
cd /home/azureuser/aiq/lunch-time/client
npm run build
# Output: client/dist/
```

- [ ] **Step 2: Write PM2 ecosystem config**

```js
// ecosystem.config.js
export default {
  apps: [{
    name: 'lunchtime',
    script: './server/index.js',
    cwd: '/home/azureuser/aiq/lunch-time',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    watch: false,
    max_memory_restart: '200M',
  }],
};
```

- [ ] **Step 3: Write nginx.conf**

```nginx
# nginx.conf
server {
    listen 80;
    server_name _;

    # Serve React build
    root /home/azureuser/aiq/lunch-time/client/dist;
    index index.html;

    # SSE needs special proxy settings (no buffering)
    location /api/events {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    # Proxy all other API calls
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SPA fallback — serve index.html for all non-file routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 4: Install and configure Nginx**

```bash
sudo cp /home/azureuser/aiq/lunch-time/nginx.conf /etc/nginx/sites-available/lunchtime
sudo ln -sf /etc/nginx/sites-available/lunchtime /etc/nginx/sites-enabled/lunchtime
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```
Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

- [ ] **Step 5: Start with PM2**

```bash
cd /home/azureuser/aiq/lunch-time
npm install -g pm2  # if not already installed
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # follow printed command to auto-start on reboot
```

- [ ] **Step 6: Verify production deployment**

```bash
pm2 status
# Should show: lunchtime | online
curl http://localhost/api/menu/today
# Should return JSON (not HTML)
```
Open the server's IP in a browser — full app should load.

- [ ] **Step 7: Final commit**

```bash
git add ecosystem.config.js nginx.conf
git commit -m "feat: PM2 + Nginx deployment config"
```

---

## Final Verification Checklist

```
[ ] All server tests pass: cd server && npm test
[ ] Menu import: paste real Zalo menu text → diff shows correctly
[ ] Order flow: select name chip → select item → select addons → submit → other browser updates in realtime
[ ] Order lock: auto-lock at 11:00 (or test manual lock) → order button disabled everywhere
[ ] Order summary: Zalo text copies correctly
[ ] Debt page: week navigation works, shows per-person amounts
[ ] QR modal: opens with VietQR image, shows correct content string
[ ] SePay webhook: POST with correct content → debt card turns green in realtime, modal closes
[ ] PM2 restarts server on crash: pm2 kill && pm2 start ecosystem.config.js
[ ] Nginx serves static files and proxies /api correctly
```
