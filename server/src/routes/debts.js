// server/src/routes/debts.js
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getWeekNumber } from '../services/debtCalculator.js';
import { broadcast } from '../services/sse.js';
import { buildQrCode } from '../services/qrCode.js';

export const debtsRouter = Router();

debtsRouter.get('/', (req, res) => {
  const db = getDb();
  const week = parseInt(req.query.week) || getWeekNumber(new Date().toISOString().slice(0, 10));
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const orders = db.prepare(`
    SELECT o.person_name, o.date, o.note,
           mi.name as item_name,
           mi.price + COALESCE(SUM(ma.price), 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    GROUP BY o.id
    ORDER BY o.date, o.id
  `).all();

  const weekOrders = orders.filter(o => {
    return getWeekNumber(o.date) === week && new Date(o.date).getFullYear() === year;
  });

  const exclusions = db.prepare(`
    SELECT person_name, date FROM day_exclusions
    WHERE date IN (SELECT DISTINCT date FROM orders WHERE ${weekOrders.length ? 'date IN (' + [...new Set(weekOrders.map(o => `'${o.date}'`))].join(',') + ')' : '1=0'})
  `).all();
  const excludedSet = new Set(exclusions.map(e => `${e.person_name}|${e.date}`));

  const debtMap = {};
  const ordersByPerson = {};

  for (const o of weekOrders) {
    const isExcluded = excludedSet.has(`${o.person_name}|${o.date}`);
    if (!isExcluded) {
      debtMap[o.person_name] = (debtMap[o.person_name] || 0) + o.total_price;
    }

    if (!ordersByPerson[o.person_name]) ordersByPerson[o.person_name] = {};
    if (!ordersByPerson[o.person_name][o.date]) {
      ordersByPerson[o.person_name][o.date] = { items: [], excluded: isExcluded };
    }
    ordersByPerson[o.person_name][o.date].items.push({
      item_name: o.item_name,
      price: o.total_price,
      note: o.note || null,
    });
    // ensure all rows for this date have same exclusion flag (it's per-date)
    ordersByPerson[o.person_name][o.date].excluded = isExcluded;
  }

  // ensure people with all days excluded still appear
  for (const o of weekOrders) {
    if (!(o.person_name in debtMap)) debtMap[o.person_name] = 0;
  }

  const payments = db.prepare('SELECT * FROM payments WHERE week_number = ? AND year = ?').all(week, year);
  const paymentByPerson = Object.fromEntries(payments.map(p => [p.person_name, p]));

  const debts = Object.entries(debtMap).map(([person_name, amount]) => ({
    person_name,
    amount,
    status: paymentByPerson[person_name]?.status || 'pending',
    paid_at: paymentByPerson[person_name]?.paid_at || null,
    sepay_ref: paymentByPerson[person_name]?.sepay_ref || null,
    orders_by_date: Object.entries(ordersByPerson[person_name] || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { items, excluded }]) => ({
        date,
        items,
        excluded: excluded || false,
        subtotal: items.reduce((s, i) => s + i.price, 0),
      })),
  }));

  res.json({ week, year, debts });
});

debtsRouter.get('/accumulated', (req, res) => {
  const db = getDb();

  const orders = db.prepare(`
    SELECT o.person_name, o.date,
           mi.price + COALESCE(SUM(ma.price), 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    GROUP BY o.id
    ORDER BY o.date
  `).all();

  const exclusions = db.prepare('SELECT person_name, date FROM day_exclusions').all();
  const excludedSet = new Set(exclusions.map(e => `${e.person_name}|${e.date}`));

  const payments = db.prepare('SELECT * FROM payments').all();
  const paymentMap = Object.fromEntries(payments.map(p => [`${p.person_name}|${p.week_number}|${p.year}`, p]));

  const personWeekMap = {};
  for (const o of orders) {
    const week = getWeekNumber(o.date);
    const year = new Date(o.date).getFullYear();
    const isExcluded = excludedSet.has(`${o.person_name}|${o.date}`);
    if (!personWeekMap[o.person_name]) personWeekMap[o.person_name] = {};
    const wk = `${week}|${year}`;
    if (!personWeekMap[o.person_name][wk]) personWeekMap[o.person_name][wk] = { week, year, amount: 0 };
    if (!isExcluded) personWeekMap[o.person_name][wk].amount += o.total_price;
  }

  const result = [];
  for (const [person_name, weeks] of Object.entries(personWeekMap)) {
    const unpaidWeeks = [];
    let total = 0;
    for (const data of Object.values(weeks)) {
      const payment = paymentMap[`${person_name}|${data.week}|${data.year}`];
      if (data.amount > 0 && (!payment || payment.status !== 'paid')) {
        unpaidWeeks.push({ week: data.week, year: data.year, amount: data.amount });
        total += data.amount;
      }
    }
    if (total > 0) {
      unpaidWeeks.sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week);
      result.push({ person_name, total_amount: total, unpaid_weeks: unpaidWeeks });
    }
  }

  result.sort((a, b) => b.total_amount - a.total_amount);
  res.json({ debts: result });
});

debtsRouter.get('/person/:name/unpaid-detail', (req, res) => {
  const db = getDb();
  const person_name = decodeURIComponent(req.params.name);

  const orders = db.prepare(`
    SELECT o.date, o.note,
           mi.name as item_name,
           mi.price + COALESCE(SUM(ma.price), 0) as total_price
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    WHERE lower(o.person_name) = lower(?)
    GROUP BY o.id
    ORDER BY o.date, o.id
  `).all(person_name);

  const exclusions = db.prepare(`SELECT date FROM day_exclusions WHERE lower(person_name) = lower(?)`).all(person_name);
  const excludedDates = new Set(exclusions.map(e => e.date));

  const payments = db.prepare(`SELECT week_number, year, status FROM payments WHERE lower(person_name) = lower(?)`).all(person_name);
  const paidSet = new Set(payments.filter(p => p.status === 'paid').map(p => `${p.week_number}|${p.year}`));

  const byDate = {};
  let totalAmount = 0;

  for (const o of orders) {
    const week = getWeekNumber(o.date);
    const year = new Date(o.date).getFullYear();
    if (paidSet.has(`${week}|${year}`)) continue;

    const isExcluded = excludedDates.has(o.date);
    if (!byDate[o.date]) byDate[o.date] = { items: [], excluded: isExcluded };
    byDate[o.date].items.push({ item_name: o.item_name, price: o.total_price, note: o.note || null });
    byDate[o.date].excluded = isExcluded;
    if (!isExcluded) totalAmount += o.total_price;
  }

  const orders_by_date = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { items, excluded }]) => ({ date, items, excluded, subtotal: items.reduce((s, i) => s + i.price, 0) }));

  res.json({ person_name, total_amount: totalAmount, orders_by_date });
});

debtsRouter.post('/override', (req, res) => {
  const { person_name, week, year, status, password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'wrong_password' });
  }
  if (!person_name || !week || !year || !['paid', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'invalid_params' });
  }

  const db = getDb();
  if (status === 'paid') {
    db.prepare(`
      INSERT INTO payments (person_name, week_number, year, amount, status, paid_at)
      VALUES (@person_name, @week_number, @year, 0, 'paid', @paid_at)
      ON CONFLICT(person_name, week_number, year)
      DO UPDATE SET status='paid', paid_at=@paid_at
    `).run({ person_name, week_number: week, year, paid_at: new Date().toISOString() });
  } else {
    db.prepare(`
      UPDATE payments SET status='pending' WHERE person_name=? AND week_number=? AND year=?
    `).run(person_name, week, year);
  }

  broadcast('payment_updated', { person_name, week, year, status });

  res.json({ success: true });
});

debtsRouter.post('/exclude-day', (req, res) => {
  const { person_name, date, excluded, password } = req.body;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'wrong_password' });
  }
  if (!person_name || !date) {
    return res.status(400).json({ error: 'invalid_params' });
  }

  const db = getDb();
  if (excluded) {
    db.prepare(`INSERT OR IGNORE INTO day_exclusions (person_name, date) VALUES (?, ?)`).run(person_name, date);
  } else {
    db.prepare(`DELETE FROM day_exclusions WHERE person_name = ? AND date = ?`).run(person_name, date);
  }

  // Recalculate amount for broadcast
  const week = getWeekNumber(date);
  const year = new Date(date).getFullYear();
  broadcast('debt_updated', { person_name, week, year });

  res.json({ success: true });
});

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
