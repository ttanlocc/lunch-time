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
