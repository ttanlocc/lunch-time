// server/src/routes/debts.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getWeekNumber } from '../services/debtCalculator.js';
import { broadcast } from '../services/sse.js';
import { buildQrCode } from '../services/qrCode.js';

export const debtsRouter = Router();

function getPaidDates(db, personName) {
  return new Set(
    db.prepare("SELECT date FROM payments WHERE lower(person_name) = lower(?) AND status = 'paid'")
      .all(personName)
      .map(p => p.date)
  );
}

function getUnpaidDaysForPerson(db, personName) {
  const orders = db.prepare(`
    SELECT o.date, mi.price + COALESCE(ma_sum.total, 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN (
      SELECT oa.order_id, SUM(ma.price) as total
      FROM order_addons oa JOIN menu_addons ma ON ma.id = oa.addon_id
      GROUP BY oa.order_id
    ) ma_sum ON ma_sum.order_id = o.id
    WHERE lower(o.person_name) = lower(?)
  `).all(personName);

  const excludedDates = new Set(
    db.prepare('SELECT date FROM day_exclusions WHERE lower(person_name) = lower(?)').all(personName).map(e => e.date)
  );
  const paidDates = getPaidDates(db, personName);

  const dayMap = {};
  for (const o of orders) {
    if (excludedDates.has(o.date) || paidDates.has(o.date)) continue;
    dayMap[o.date] = (dayMap[o.date] || 0) + o.total_price;
  }

  return Object.entries(dayMap)
    .filter(([, amount]) => amount > 0)
    .map(([date, amount]) => ({ date, amount }));
}

// GET /api/debts?week=X&year=Y  (week view, kept for compatibility)
debtsRouter.get('/', (req, res) => {
  const db = getDb();
  const week = parseInt(req.query.week) || getWeekNumber(new Date().toISOString().slice(0, 10));
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const orders = db.prepare(`
    SELECT o.person_name, o.date, o.note,
           mi.name as item_name,
           mi.price + COALESCE(ma_sum.total, 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN (
      SELECT oa.order_id, SUM(ma.price) as total
      FROM order_addons oa JOIN menu_addons ma ON ma.id = oa.addon_id
      GROUP BY oa.order_id
    ) ma_sum ON ma_sum.order_id = o.id
    ORDER BY o.date, o.id
  `).all();

  const weekOrders = orders.filter(o =>
    getWeekNumber(o.date) === week && new Date(o.date).getFullYear() === year
  );

  const dates = [...new Set(weekOrders.map(o => o.date))];
  const exclusions = dates.length
    ? db.prepare(`SELECT person_name, date FROM day_exclusions WHERE date IN (${dates.map(() => '?').join(',')})`) .all(...dates)
    : [];
  const excludedSet = new Set(exclusions.map(e => `${e.person_name}|${e.date}`));

  // Per-day paid status
  const paidDays = dates.length
    ? db.prepare(`SELECT person_name, date FROM payments WHERE status='paid' AND date IN (${dates.map(() => '?').join(',')})`)
        .all(...dates)
    : [];
  const paidDaySet = new Set(paidDays.map(p => `${p.person_name}|${p.date}`));

  const debtMap = {};
  const ordersByPerson = {};

  for (const o of weekOrders) {
    const isExcluded = excludedSet.has(`${o.person_name}|${o.date}`);
    const isDayPaid = paidDaySet.has(`${o.person_name}|${o.date}`);
    if (!isExcluded && !isDayPaid) {
      debtMap[o.person_name] = (debtMap[o.person_name] || 0) + o.total_price;
    }
    if (!(o.person_name in debtMap)) debtMap[o.person_name] = 0;

    if (!ordersByPerson[o.person_name]) ordersByPerson[o.person_name] = {};
    if (!ordersByPerson[o.person_name][o.date]) {
      ordersByPerson[o.person_name][o.date] = { items: [], excluded: isExcluded, paid: isDayPaid };
    }
    ordersByPerson[o.person_name][o.date].items.push({ item_name: o.item_name, price: o.total_price, note: o.note || null });
  }

  const debts = Object.entries(debtMap).map(([person_name, amount]) => ({
    person_name,
    amount,
    status: amount === 0 ? 'paid' : 'pending',
    orders_by_date: Object.entries(ordersByPerson[person_name] || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { items, excluded, paid }]) => ({
        date,
        items,
        excluded,
        paid,
        subtotal: items.reduce((s, i) => s + i.price, 0),
      })),
  }));

  res.json({ week, year, debts });
});

// GET /api/debts/accumulated
debtsRouter.get('/accumulated', (req, res) => {
  const db = getDb();

  const orders = db.prepare(`
    SELECT o.person_name, o.date,
           mi.price + COALESCE(ma_sum.total, 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN (
      SELECT oa.order_id, SUM(ma.price) as total
      FROM order_addons oa JOIN menu_addons ma ON ma.id = oa.addon_id
      GROUP BY oa.order_id
    ) ma_sum ON ma_sum.order_id = o.id
    ORDER BY o.date
  `).all();

  const excludedSet = new Set(
    db.prepare('SELECT person_name, date FROM day_exclusions').all().map(e => `${e.person_name}|${e.date}`)
  );
  const paidSet = new Set(
    db.prepare("SELECT person_name, date FROM payments WHERE status='paid'").all().map(p => `${p.person_name}|${p.date}`)
  );

  const personDayMap = {};
  for (const o of orders) {
    if (excludedSet.has(`${o.person_name}|${o.date}`) || paidSet.has(`${o.person_name}|${o.date}`)) continue;
    if (!personDayMap[o.person_name]) personDayMap[o.person_name] = {};
    personDayMap[o.person_name][o.date] = (personDayMap[o.person_name][o.date] || 0) + o.total_price;
  }

  const result = [];
  for (const [person_name, dayMap] of Object.entries(personDayMap)) {
    const unpaid_days = Object.entries(dayMap)
      .filter(([, amount]) => amount > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));
    const total_amount = unpaid_days.reduce((s, d) => s + d.amount, 0);
    if (total_amount > 0) result.push({ person_name, total_amount, unpaid_days });
  }

  result.sort((a, b) => b.total_amount - a.total_amount);
  res.json({ debts: result });
});

// GET /api/debts/paid  — paid payments grouped into closed tickets
debtsRouter.get('/paid', (req, res) => {
  const db = getDb();

  const rows = db.prepare(`
    SELECT person_name, date, amount, paid_at, sepay_ref, match_method
    FROM payments
    WHERE status = 'paid'
    ORDER BY paid_at DESC, id DESC
  `).all();

  const ticketMap = new Map();
  for (const r of rows) {
    // Group by transfer: sepay_ref when present, else person + paid_at (one manual mark)
    const key = r.sepay_ref
      ? `ref:${r.sepay_ref}`
      : `manual:${r.person_name}|${r.paid_at ?? ''}`;

    let ticket = ticketMap.get(key);
    if (!ticket) {
      ticket = {
        person_name: r.person_name,
        total_amount: 0,
        paid_at: r.paid_at,
        sepay_ref: r.sepay_ref,
        match_method: r.match_method || 'manual',
        days: [],
      };
      ticketMap.set(key, ticket);
    }
    ticket.total_amount += r.amount || 0;
    ticket.days.push({ date: r.date, amount: r.amount || 0 });
    if (r.paid_at && (!ticket.paid_at || r.paid_at > ticket.paid_at)) ticket.paid_at = r.paid_at;
  }

  const tickets = [...ticketMap.values()]
    .map(t => ({ ...t, days: t.days.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''));

  res.json({ tickets });
});

// GET /api/debts/person/:name/unpaid-detail
debtsRouter.get('/person/:name/unpaid-detail', (req, res) => {
  const db = getDb();
  const person_name = decodeURIComponent(req.params.name);

  const orders = db.prepare(`
    SELECT o.date, o.note,
           mi.name as item_name,
           mi.price + COALESCE(ma_sum.total, 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN (
      SELECT oa.order_id, SUM(ma.price) as total
      FROM order_addons oa JOIN menu_addons ma ON ma.id = oa.addon_id
      GROUP BY oa.order_id
    ) ma_sum ON ma_sum.order_id = o.id
    WHERE lower(o.person_name) = lower(?)
    ORDER BY o.date, o.id
  `).all(person_name);

  const excludedDates = new Set(
    db.prepare('SELECT date FROM day_exclusions WHERE lower(person_name) = lower(?)').all(person_name).map(e => e.date)
  );
  const paidDates = getPaidDates(db, person_name);

  const byDate = {};
  let totalAmount = 0;

  for (const o of orders) {
    if (paidDates.has(o.date)) continue;
    const isExcluded = excludedDates.has(o.date);
    if (!byDate[o.date]) byDate[o.date] = { items: [], excluded: isExcluded };
    byDate[o.date].items.push({ item_name: o.item_name, price: o.total_price, note: o.note || null });
    if (!isExcluded) totalAmount += o.total_price;
  }

  const orders_by_date = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { items, excluded }]) => ({
      date, items, excluded,
      subtotal: excluded ? 0 : items.reduce((s, i) => s + i.price, 0),
    }));

  res.json({ person_name, total_amount: totalAmount, orders_by_date });
});

// GET /api/debts/person/:name/qr  — generates QR for all unpaid days
debtsRouter.get('/person/:name/qr', (req, res) => {
  const db = getDb();
  const person_name = decodeURIComponent(req.params.name);

  const unpaidDays = getUnpaidDaysForPerson(db, person_name);
  const amount = unpaidDays.reduce((s, d) => s + d.amount, 0);

  const week = getWeekNumber(new Date().toISOString().slice(0, 10));
  const year = new Date().getFullYear();
  const qrCode = buildQrCode(person_name, week, year);

  const upsert = db.prepare(`
    INSERT INTO payments (person_name, date, amount, status, qr_code)
    VALUES (@person_name, @date, @amount, 'pending', @qr_code)
    ON CONFLICT(person_name, date) DO UPDATE SET
      qr_code = @qr_code,
      amount = CASE WHEN status = 'pending' THEN @amount ELSE amount END
  `);
  db.transaction(() => {
    for (const d of unpaidDays) {
      upsert.run({ person_name, date: d.date, amount: d.amount, qr_code: qrCode });
    }
  })();

  const BANK_CODE = process.env.BANK_CODE || 'MB';
  const BANK_ACCOUNT = process.env.BANK_ACCOUNT || '';
  const qrImageUrl = `https://qr.sepay.vn/img?acc=${BANK_ACCOUNT}&bank=${BANK_CODE}&amount=${amount}&des=${encodeURIComponent(qrCode)}&template=compact`;

  res.json({ qrCode, amount, qrImageUrl, week, year, person_name });
});

// POST /api/debts/override  — mark specific date or all unpaid days as paid/pending
debtsRouter.post('/override', (req, res) => {
  const { person_name, date, status, password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'wrong_password' });
  if (!person_name || !['paid', 'pending'].includes(status)) return res.status(400).json({ error: 'invalid_params' });

  const db = getDb();
  const paidAt = new Date().toISOString();

  if (date) {
    if (status === 'paid') {
      db.prepare(`
        INSERT INTO payments (person_name, date, amount, status, paid_at)
        VALUES (?, ?, 0, 'paid', ?)
        ON CONFLICT(person_name, date) DO UPDATE SET status='paid', paid_at=excluded.paid_at
      `).run(person_name, date, paidAt);
    } else {
      db.prepare(`UPDATE payments SET status='pending' WHERE lower(person_name) = lower(?) AND date = ?`).run(person_name, date);
    }
  } else {
    if (status === 'paid') {
      const unpaidDays = getUnpaidDaysForPerson(db, person_name);
      const upsert = db.prepare(`
        INSERT INTO payments (person_name, date, amount, status, paid_at)
        VALUES (?, ?, ?, 'paid', ?)
        ON CONFLICT(person_name, date) DO UPDATE SET status='paid', paid_at=excluded.paid_at, amount=excluded.amount
      `);
      db.transaction(() => {
        for (const d of unpaidDays) upsert.run(person_name, d.date, d.amount, paidAt);
      })();
    } else {
      db.prepare(`UPDATE payments SET status='pending' WHERE lower(person_name) = lower(?)`).run(person_name);
    }
  }

  broadcast('payment_updated', { person_name, status });
  res.json({ success: true });
});

// POST /api/debts/exclude-day
debtsRouter.post('/exclude-day', (req, res) => {
  const { person_name, date, excluded, password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'wrong_password' });
  if (!person_name || !date) return res.status(400).json({ error: 'invalid_params' });

  const db = getDb();
  if (excluded) {
    db.prepare('INSERT OR IGNORE INTO day_exclusions (person_name, date) VALUES (?, ?)').run(person_name, date);
  } else {
    db.prepare('DELETE FROM day_exclusions WHERE person_name = ? AND date = ?').run(person_name, date);
  }

  broadcast('debt_updated', { person_name, date });
  res.json({ success: true });
});
