// server/src/routes/debts.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getWeekNumber } from '../services/debtCalculator.js';

export const debtsRouter = Router();

debtsRouter.get('/', (req, res) => {
  const db = getDb();
  const week = parseInt(req.query.week) || getWeekNumber(new Date().toISOString().slice(0, 10));
  const year = parseInt(req.query.year) || new Date().getFullYear();

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

  const weekOrders = orders.filter(o => {
    const d = new Date(o.date);
    return getWeekNumber(o.date) === week && d.getFullYear() === year;
  });

  const debtMap = {};
  for (const o of weekOrders) {
    debtMap[o.person_name] = (debtMap[o.person_name] || 0) + o.total_price;
  }

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
