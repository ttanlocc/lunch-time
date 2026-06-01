// server/src/routes/orders.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { broadcast } from '../services/sse.js';
import { getWeekNumber } from '../services/debtCalculator.js';

export const ordersRouter = Router();

// GET /api/orders/today
ordersRouter.get('/today', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const orders = db.prepare(`
    SELECT o.id, o.person_name, o.note, mi.name as item_name, mi.price, mi.category,
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
  const { person_name, menu_item_id, extra_ids = [], note = null } = req.body;

  if (!person_name || !menu_item_id) {
    return res.status(400).json({ error: 'person_name and menu_item_id required' });
  }

  if (note && note.length > 200) {
    return res.status(400).json({ error: 'note must be 200 characters or less' });
  }

  const isLocked = db.prepare('SELECT is_locked FROM daily_menu WHERE date = ? LIMIT 1').get(today)?.is_locked === 1;
  if (isLocked) return res.status(409).json({ error: 'Orders are locked for today' });

  const submit = db.transaction(() => {
    // Delete all existing orders for this person today (fresh order)
    const existingOrders = db.prepare('SELECT id FROM orders WHERE person_name = ? AND date = ?').all(person_name, today);
    for (const existing of existingOrders) {
      db.prepare('DELETE FROM order_addons WHERE order_id = ?').run(existing.id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(existing.id);
    }

    const orderIds = [];

    // Create main dish order
    const { lastInsertRowid: mainOrderId } = db.prepare(
      'INSERT INTO orders (person_name, menu_item_id, date, note) VALUES (?, ?, ?, ?)'
    ).run(person_name, menu_item_id, today, note || null);
    orderIds.push(mainOrderId);

    // Create separate order for each extra item
    for (const extra_id of extra_ids) {
      const { lastInsertRowid: extraOrderId } = db.prepare(
        'INSERT INTO orders (person_name, menu_item_id, date) VALUES (?, ?, ?)'
      ).run(person_name, extra_id, today);
      orderIds.push(extraOrderId);
    }

    return orderIds;
  });

  const orderIds = submit();

  // Get all orders for this person
  const orders = db.prepare(`
    SELECT o.id, o.person_name, o.note, mi.name as item_name, mi.price, mi.category
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    WHERE o.person_name = ? AND o.date = ?
    ORDER BY mi.category, o.created_at
  `).all(person_name, today);

  broadcast('order_submitted', { orders, person_name, date: today });
  res.status(201).json({ orders, person_name });
});

// POST /api/orders/confirm - mark order as placed
ordersRouter.post('/confirm', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const { person_name } = req.body;

  if (!person_name) {
    return res.status(400).json({ error: 'person_name required' });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE daily_menu
    SET confirmed_at = ?, confirmed_by = ?
    WHERE date = ?
  `).run(now, person_name, today);

  const confirmation = { confirmed_at: now, confirmed_by: person_name, date: today };
  broadcast('order_confirmed', confirmation);
  res.json(confirmation);
});

// GET /api/orders/confirmation - get today's confirmation status
ordersRouter.get('/confirmation', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const row = db.prepare('SELECT confirmed_at, confirmed_by FROM daily_menu WHERE date = ? LIMIT 1').get(today);
  res.json({
    confirmed_at: row?.confirmed_at || null,
    confirmed_by: row?.confirmed_by || null
  });
});

function getWeekDateRange(week, year) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (dayOfWeek - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

// GET /api/orders/week?week=X&year=Y
ordersRouter.get('/week', (req, res) => {
  const db = getDb();
  const week = parseInt(req.query.week) || getWeekNumber(new Date().toISOString().slice(0, 10));
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const { start, end } = getWeekDateRange(week, year);

  const weekOrders = db.prepare(`
    SELECT o.id, o.person_name, o.date, o.note, mi.name as item_name, mi.price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    WHERE o.date BETWEEN ? AND ?
    ORDER BY o.date, o.person_name, o.id
  `).all(start, end);

  if (weekOrders.length === 0) {
    return res.json({ week, year, days: [] });
  }

  // Query exclusions for these dates
  const dates = [...new Set(weekOrders.map(o => o.date))];
  const exclusions = db.prepare(`
    SELECT person_name, date FROM day_exclusions
    WHERE date IN (${dates.map(() => '?').join(',')})
  `).all(...dates);

  const exclusionSet = new Set(exclusions.map(e => `${e.person_name}|${e.date}`));

  // Query payments for this week (per-day schema)
  const payments = db.prepare(`
    SELECT person_name, date, status, paid_at FROM payments
    WHERE date BETWEEN ? AND ?
  `).all(start, end);

  const paymentMap = new Map(payments.map(p => [`${p.person_name}|${p.date}`, { status: p.status, paid_at: p.paid_at }]));

  // Group by date → people
  const dayMap = new Map();

  for (const order of weekOrders) {
    if (!dayMap.has(order.date)) {
      dayMap.set(order.date, new Map());
    }
    const peopleMap = dayMap.get(order.date);

    if (!peopleMap.has(order.person_name)) {
      const payment = paymentMap.get(`${order.person_name}|${order.date}`);
      peopleMap.set(order.person_name, {
        person_name: order.person_name,
        subtotal: 0,
        excluded: exclusionSet.has(`${order.person_name}|${order.date}`),
        week_status: payment?.status ?? 'pending',
        week_paid_at: payment?.paid_at ?? null,
        orders: [],
      });
    }

    const person = peopleMap.get(order.person_name);
    person.orders.push({ id: order.id, item_name: order.item_name, price: order.price, note: order.note });

    if (!person.excluded) {
      person.subtotal += order.price;
    }
  }

  const days = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, peopleMap]) => {
      const people = [...peopleMap.values()].sort((a, b) => a.person_name.localeCompare(b.person_name));
      const day_total = people.reduce((sum, p) => sum + p.subtotal, 0);
      return { date, day_total, people };
    });

  res.json({ week, year, days });
});

// GET /api/orders/month?month=X&year=Y
ordersRouter.get('/month', (req, res) => {
  const db = getDb();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
  const year  = parseInt(req.query.year)  || new Date().getFullYear();

  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay   = new Date(year, month, 0).getDate();
  const endDate   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const rows = db.prepare(`
    SELECT o.person_name, o.date, o.note, mi.name as item_name, mi.price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    WHERE o.date BETWEEN ? AND ?
    ORDER BY o.date, o.person_name
  `).all(startDate, endDate);

  const people = [...new Set(rows.map(r => r.person_name))].sort();

  const dayMap = {};
  for (const row of rows) {
    if (!dayMap[row.date]) dayMap[row.date] = {};
    if (!dayMap[row.date][row.person_name]) {
      dayMap[row.date][row.person_name] = { name: row.person_name, subtotal: 0, items: [], paid: false };
    }
    dayMap[row.date][row.person_name].subtotal += row.price;
    dayMap[row.date][row.person_name].items.push({
      item_name: row.item_name,
      price: row.price,
      note: row.note,
    });
  }

  // Attach payment status: payments are stored per-person per-date
  const paidMap = new Map(
    db.prepare(
      "SELECT person_name, date, paid_at FROM payments WHERE date BETWEEN ? AND ? AND status = 'paid'"
    ).all(startDate, endDate).map(p => [`${p.person_name}|${p.date}`, p.paid_at])
  );

  for (const [date, peopleObj] of Object.entries(dayMap)) {
    for (const person of Object.values(peopleObj)) {
      const paidAt = paidMap.get(`${person.name}|${date}`);
      person.paid = paidAt !== undefined;
      person.paid_at = paidAt ?? null;
    }
  }

  const days = {};
  for (const [date, peopleObj] of Object.entries(dayMap)) {
    const peopleArr = Object.values(peopleObj);
    days[date] = {
      total: peopleArr.reduce((s, p) => s + p.subtotal, 0),
      count: peopleArr.length,
      people: peopleArr,
    };
  }

  res.json({ month, year, people, days });
});

// PUT /api/orders/:id - admin override order
ordersRouter.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { menu_item_id, addon_ids = [] } = req.body;

  if (!menu_item_id) {
    return res.status(400).json({ error: 'menu_item_id required' });
  }

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const update = db.transaction(() => {
    db.prepare('DELETE FROM order_addons WHERE order_id = ?').run(id);
    db.prepare('UPDATE orders SET menu_item_id = ? WHERE id = ?').run(menu_item_id, id);

    for (const addon_id of addon_ids) {
      db.prepare('INSERT INTO order_addons (order_id, addon_id) VALUES (?, ?)').run(id, addon_id);
    }
  });

  update();

  const order = db.prepare(`
    SELECT o.id, o.person_name, mi.name as item_name, mi.price,
           GROUP_CONCAT(ma.name) as addon_names
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    WHERE o.id = ?
    GROUP BY o.id
  `).get(id);

  broadcast('order_submitted', { order, date: existing.date });
  res.json(order);
});

// DELETE /api/orders/today/:person - user cancel their own order
ordersRouter.delete('/today/:person', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const person_name = decodeURIComponent(req.params.person);

  const isLocked = db.prepare('SELECT is_locked FROM daily_menu WHERE date = ? LIMIT 1').get(today)?.is_locked === 1;
  if (isLocked) return res.status(409).json({ error: 'Orders are locked for today' });

  const existing = db.prepare('SELECT id FROM orders WHERE person_name = ? AND date = ?').all(person_name, today);
  if (!existing.length) return res.status(404).json({ error: 'No order found' });

  const cancel = db.transaction(() => {
    for (const o of existing) {
      db.prepare('DELETE FROM order_addons WHERE order_id = ?').run(o.id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(o.id);
    }
  });
  cancel();

  broadcast('order_cancelled', { person_name, date: today });
  res.json({ cancelled: true, person_name });
});

// DELETE /api/orders/:id - admin delete order
ordersRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }

  db.prepare('DELETE FROM order_addons WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);

  broadcast('order_deleted', { id, person_name: existing.person_name, date: existing.date });
  res.json({ deleted: true, id });
});
