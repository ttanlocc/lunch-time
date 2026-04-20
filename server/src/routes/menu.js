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

  const addons = items.length > 0
    ? db.prepare(`SELECT * FROM menu_addons WHERE menu_item_id IN (${items.map(() => '?').join(',')})`).all(...items.map(i => i.id))
    : [];

  const addonsByItem = {};
  for (const a of addons) {
    if (!addonsByItem[a.menu_item_id]) addonsByItem[a.menu_item_id] = [];
    addonsByItem[a.menu_item_id].push(a);
  }

  res.json({
    items: items.map(i => ({ ...i, addons: addonsByItem[i.id] || [] })),
    is_locked: items[0]?.is_locked === 1
  });
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

  const upsertAddon = db.prepare(`
    INSERT OR IGNORE INTO menu_addons (menu_item_id, name, price) VALUES (?, ?, ?)
  `);

  const importAll = db.transaction(() => {
    const result = { new_items: [], available: [], unavailable: [] };

    for (const item of items) {
      const existing = db.prepare('SELECT id FROM menu_items WHERE normalized_name = ?').get(item.normalizedName);
      upsertItem.run(item);
      const row = db.prepare('SELECT id FROM menu_items WHERE normalized_name = ?').get(item.normalizedName);
      upsertDaily.run({ menu_item_id: row.id, date: today });

      if (!existing) result.new_items.push(item.name);
      else result.available.push(item.name);

      const itemAddons = addons[item.normalizedName] || [];
      for (const a of itemAddons) upsertAddon.run(row.id, a.name, a.price);
    }

    const todayItems = db.prepare('SELECT mi.name, mi.normalized_name FROM daily_menu dm JOIN menu_items mi ON mi.id = dm.menu_item_id WHERE dm.date = ? AND dm.is_available = 1').all(today);
    const availableNormalizedNames = new Set(items.map(i => i.normalizedName));
    result.unavailable = todayItems.filter(r => !availableNormalizedNames.has(r.normalized_name)).map(r => r.name);

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
