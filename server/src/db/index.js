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

    // Migration: add confirmed_at and confirmed_by columns to daily_menu
    const dailyMenuCols = _db.prepare("PRAGMA table_info(daily_menu)").all().map(c => c.name);
    if (!dailyMenuCols.includes('confirmed_at')) {
      _db.exec('ALTER TABLE daily_menu ADD COLUMN confirmed_at TEXT');
    }
    if (!dailyMenuCols.includes('confirmed_by')) {
      _db.exec('ALTER TABLE daily_menu ADD COLUMN confirmed_by TEXT');
    }

    // Migration: add note column to orders
    const orderCols = _db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
    if (!orderCols.includes('note')) {
      _db.exec('ALTER TABLE orders ADD COLUMN note TEXT');
    }

    // Migration: snapshot line price onto each order. Previously every total
    // re-read the live menu_items.price, so re-importing a dish at a new price
    // silently rewrote historical debts. Freeze the price per order instead.
    if (!orderCols.includes('price')) {
      _db.exec('ALTER TABLE orders ADD COLUMN price INTEGER NOT NULL DEFAULT 0');
      // Best-effort backfill from current menu price + addon prices. Price drift
      // that happened before this column existed cannot be recovered.
      _db.exec(`
        UPDATE orders SET price = COALESCE((
          SELECT mi.price + COALESCE((
            SELECT SUM(ma.price) FROM order_addons oa
            JOIN menu_addons ma ON ma.id = oa.addon_id
            WHERE oa.order_id = orders.id
          ), 0)
          FROM menu_items mi WHERE mi.id = orders.menu_item_id
        ), 0)
      `);
    }

    // Migration: deduplicate menu_addons and add UNIQUE index
    const indexes = _db.prepare("PRAGMA index_list(menu_addons)").all().map(i => i.name);
    if (!indexes.includes('idx_menu_addons_unique')) {
      _db.exec(`
        DELETE FROM menu_addons
        WHERE id NOT IN (
          SELECT MIN(id) FROM menu_addons GROUP BY menu_item_id, name
        );
        CREATE UNIQUE INDEX idx_menu_addons_unique ON menu_addons(menu_item_id, name);
      `);
    }

    // bot_conversation table created via CREATE TABLE IF NOT EXISTS in schema — no column migration needed

    // Migration: convert payments from per-week to per-day
    const paymentCols = _db.prepare("PRAGMA table_info(payments)").all().map(c => c.name);
    if (paymentCols.includes('week_number')) {
      const getWeekNum = (dateStr) => {
        const d = new Date(dateStr);
        const jan4 = new Date(d.getFullYear(), 0, 4);
        const startOfWeek1 = new Date(jan4);
        startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
        return Math.floor((d - startOfWeek1) / (7 * 86400000)) + 1;
      };

      _db.exec(`
        CREATE TABLE IF NOT EXISTS payments_perday (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          person_name TEXT NOT NULL,
          date TEXT NOT NULL,
          amount INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          sepay_ref TEXT,
          paid_at TEXT,
          qr_code TEXT,
          match_method TEXT,
          UNIQUE(person_name, date)
        )
      `);

      const paidPayments = _db.prepare("SELECT * FROM payments WHERE status = 'paid'").all();
      const insertDay = _db.prepare(`
        INSERT OR IGNORE INTO payments_perday
          (person_name, date, amount, status, sepay_ref, paid_at, qr_code, match_method)
        VALUES (@person_name, @date, @amount, @status, @sepay_ref, @paid_at, @qr_code, @match_method)
      `);

      _db.transaction(() => {
        for (const p of paidPayments) {
          const orderDates = _db.prepare(
            'SELECT DISTINCT date FROM orders WHERE lower(person_name) = lower(?)'
          ).all(p.person_name);

          for (const { date } of orderDates) {
            const week = getWeekNum(date);
            const year = new Date(date).getFullYear();
            if (week !== p.week_number || year !== p.year) continue;

            const row = _db.prepare(`
              SELECT COALESCE(SUM(mi.price + COALESCE(ma_sum.total, 0)), 0) as total
              FROM orders o
              JOIN menu_items mi ON mi.id = o.menu_item_id
              LEFT JOIN (
                SELECT oa.order_id, SUM(ma.price) as total
                FROM order_addons oa JOIN menu_addons ma ON ma.id = oa.addon_id
                GROUP BY oa.order_id
              ) ma_sum ON ma_sum.order_id = o.id
              WHERE lower(o.person_name) = lower(?) AND o.date = ?
            `).get(p.person_name, date);

            insertDay.run({
              person_name: p.person_name,
              date,
              amount: row?.total ?? 0,
              status: 'paid',
              sepay_ref: p.sepay_ref ?? null,
              paid_at: p.paid_at ?? null,
              qr_code: p.qr_code ?? null,
              match_method: p.match_method ?? null,
            });
          }
        }

        _db.exec('DROP TABLE payments');
        _db.exec('ALTER TABLE payments_perday RENAME TO payments');
      })();
    } else {
      // Ensure new columns exist for installs that already have the new schema but missing cols
      if (!paymentCols.includes('qr_code')) _db.exec('ALTER TABLE payments ADD COLUMN qr_code TEXT');
      if (!paymentCols.includes('match_method')) _db.exec('ALTER TABLE payments ADD COLUMN match_method TEXT');
    }

    // Migration: people directory — maps a person_name to a company email so the
    // Friday debt reminder can DM each debtor. name is the canonical DB person_name.
    _db.exec(`
      CREATE TABLE IF NOT EXISTS people (
        name TEXT PRIMARY KEY,
        email TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Per-notification opt-in flags. `active` stays the master "notifications on"
    // switch; these three gate each individual notification type. Default on so
    // existing people keep getting everything until they opt a type out.
    const peopleCols = _db.prepare('PRAGMA table_info(people)').all().map(c => c.name);
    if (!peopleCols.includes('notify_weekly'))   _db.exec('ALTER TABLE people ADD COLUMN notify_weekly INTEGER NOT NULL DEFAULT 1');
    if (!peopleCols.includes('notify_monthend')) _db.exec('ALTER TABLE people ADD COLUMN notify_monthend INTEGER NOT NULL DEFAULT 1');
    if (!peopleCols.includes('notify_receipt'))  _db.exec('ALTER TABLE people ADD COLUMN notify_receipt INTEGER NOT NULL DEFAULT 1');

    // Seed the directory with every name we've ever seen on an order, so the admin
    // only has to fill in emails rather than retype names. Existing rows are kept.
    _db.exec(`
      INSERT OR IGNORE INTO people (name)
      SELECT DISTINCT person_name FROM orders
    `);
  }
  return _db;
}

let _roDb;

// A second connection opened in SQLite's own readonly mode (not just "we
// promise not to write") — any INSERT/UPDATE/DELETE attempt through it throws
// SQLITE_READONLY at the engine level. Used to hard-enforce read-only access
// for the AI analyst's DB tools, independent of what the JS wrapper code does.
// WAL mode (set in getDb()) allows concurrent readers alongside the writer, so
// this is safe to hold open for the process lifetime.
export function getReadonlyDb() {
  if (!_roDb) {
    getDb(); // ensure schema/migrations have run and the file exists first
    _roDb = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return _roDb;
}
