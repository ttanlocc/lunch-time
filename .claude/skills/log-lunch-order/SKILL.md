---
name: log-lunch-order
description: Log today's lunch orders (món ăn + người ăn + giá) into the lunch-time app. Use when the user pastes a message like "Bún REAL 35k Lộc Long Đạt Giang Trung" or "Bún REAL nhỏ Khang 30k" and asks to log/ghi tiền ăn trưa.
---

# Log lunch order

Parses a shorthand message (dish name + price + list of people) and writes
real orders into the running app via its HTTP API, so it shows up in
`/api/orders/today`, the debt page, and reminder emails exactly like a normal
order placed through the UI.

## Message format

One or more lines, each: `<dish name> <price>k [people...]` or
`<dish name> [people...] <price>k` — price and people can appear in either
order. Each line is a separate menu item + price variant (e.g. "nhỏ" = small
portion, cheaper). Every person listed on a line gets that line's item/price.

Example input:
```
Bún REAL 35k Lộc Long Đạt Giang Trung
Bún REAL nhỏ Khang 30k
```
→ 5 people get "Bún REAL" @ 35,000đ, Khang gets "Bún REAL nhỏ" @ 30,000đ.

## Steps

1. **Get today's date.** Run `date` — don't assume from context, the session
   can span days. Orders are always logged for today (`YYYY-MM-DD`).

2. **Resolve person name aliases** before touching the DB. Check the
   "Lunch team people aliases" memory (Trang → "Trang PO"; "anh Trung" ≠ "Trung";
   "anh Khang" == "Khang", canonical is "Khang"; "anh Khải" ≠ "Khải"). When
   unsure whether a name already exists, check distinct names in the DB:
   ```
   sqlite3 data/lunch.db "SELECT DISTINCT person_name FROM orders WHERE person_name LIKE '%<fragment>%';"
   ```

3. **Find or create the menu item** for each dish+price variant. The real DB
   is at `data/lunch.db` (repo root), NOT `lunch.db` or `server/lunch.db`
   (those are stale/empty artifacts — see `.gitignore`). Look it up:
   ```
   sqlite3 data/lunch.db "SELECT id,name,price FROM menu_items WHERE name LIKE '%<dish>%';"
   ```
   If no row matches the exact name+price combo, insert one:
   ```
   sqlite3 data/lunch.db "INSERT INTO menu_items (name, normalized_name, price, category) VALUES ('<Dish Name>', '<lowercase ascii-ish name>', <price_in_dong>, 'main');"
   ```
   Price is in whole đồng (35k → 35000). Reuse an existing item id whenever
   name+price already matches — don't create duplicates for the same dish.

4. **Confirm the day isn't locked** before posting:
   ```
   curl -s http://localhost:3001/api/orders/today | python3 -c "import sys,json;print(json.load(sys.stdin)['is_locked'])"
   ```
   If locked, stop and tell the user — don't try to force an order through.

5. **POST one order per person** (this is what the UI itself calls):
   ```
   curl -s -X POST http://localhost:3001/api/orders -H "Content-Type: application/json" -d '{"person_name":"<Name>","menu_item_id":<id>}'
   ```
   Note: this endpoint *replaces* that person's existing orders for today (a
   "fresh order" semantics per [orders.js](../../server/src/routes/orders.js) —
   POST /api/orders deletes prior rows for that person+date first). If a
   person needs more than one dish today, pass the extras via `extra_ids`
   in the same call rather than issuing a second POST, or you'll wipe out
   the first item.

6. **Verify** with `curl -s http://localhost:3001/api/orders/today` and
   summarize a per-person table + total back to the user.

## Notes

- The server is a long-running pm2 process (`pm2 list` → `lunchtime`) on
  port 3001 — don't restart it, just hit its API.
- Order price is snapshotted into the `orders` row at insert time, so later
  menu price edits never retroactively change past debts.
- If `curl` to `localhost:3001` fails, check `pm2 list` for the process
  status before assuming the API shape changed.
