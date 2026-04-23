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
  }
  return _db;
}
