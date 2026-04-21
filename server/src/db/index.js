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
    const columns = _db.prepare("PRAGMA table_info(daily_menu)").all().map(c => c.name);
    if (!columns.includes('confirmed_at')) {
      _db.exec('ALTER TABLE daily_menu ADD COLUMN confirmed_at TEXT');
    }
    if (!columns.includes('confirmed_by')) {
      _db.exec('ALTER TABLE daily_menu ADD COLUMN confirmed_by TEXT');
    }
  }
  return _db;
}
