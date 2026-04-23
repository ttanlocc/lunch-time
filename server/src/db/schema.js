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
    week_number INTEGER NOT NULL,
    year INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    sepay_ref TEXT,
    paid_at TEXT,
    -- amount = sum of orders for that person that week (calculated at QR generation time)
    UNIQUE(person_name, week_number, year)
  );

  CREATE TABLE IF NOT EXISTS bot_conversation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    service_url TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    tenant_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;
