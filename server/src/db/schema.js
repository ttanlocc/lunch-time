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
    price INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_addons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    addon_id INTEGER NOT NULL REFERENCES menu_addons(id)
  );

  CREATE TABLE IF NOT EXISTS day_exclusions (
    person_name TEXT NOT NULL,
    date TEXT NOT NULL,
    PRIMARY KEY (person_name, date)
  );

  CREATE TABLE IF NOT EXISTS payments (
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
  );

  CREATE TABLE IF NOT EXISTS bot_conversation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    service_url TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    tenant_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    sepay_id INTEGER,
    raw_content TEXT,
    transfer_amount INTEGER,
    sepay_ref TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    matched_payment_id INTEGER REFERENCES payments(id),
    notes TEXT
  );

  -- AI-generated insights cache. One row per (date, kind) so the daily LLM call
  -- runs at most once and web/Teams just read the cached text. 'kind' lets us
  -- store different flavours later (e.g. 'daily_suggestion', 'weekly_summary').
  CREATE TABLE IF NOT EXISTS insights_cache (
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (date, kind)
  );
`;
