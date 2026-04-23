# Admin Debt Management Page — Design Spec

**Date:** 2026-04-23
**Route:** `/admin/manage`
**Status:** Approved

---

## 1. Goal

Provide admins a dedicated page to view and manage all debt-related information organized by day, with session-based authentication so they don't re-enter a password on every action.

---

## 2. Architecture

### New files
- `client/src/pages/AdminManagePage.jsx` — main page component

### Modified files
- `server/src/routes/orders.js` — add `GET /api/orders/week` endpoint
- `client/src/lib/api.js` — add `getOrdersForWeek(week, year)`
- `client/src/App.jsx` — add `/admin/manage` route
- `client/src/components/AdminSidebar.jsx` — add "Quản lý nợ" nav item

---

## 3. Server Endpoint

### `GET /api/orders/week?week=X&year=Y`

Returns all orders for the given week with full detail including order IDs (needed for edit/delete), merged with exclusion and payment status.

**Response shape:**
```json
{
  "week": 17,
  "year": 2026,
  "days": [
    {
      "date": "2026-04-21",
      "day_total": 125000,
      "people": [
        {
          "person_name": "Nguyễn A",
          "subtotal": 80000,
          "excluded": false,
          "week_status": "pending",
          "week_paid_at": null,
          "orders": [
            { "id": 12, "item_name": "Phở bò đặc biệt", "price": 45000, "note": null },
            { "id": 13, "item_name": "Trà sữa trân châu", "price": 35000, "note": null }
          ]
        }
      ]
    }
  ]
}
```

Only days that have at least one order are included. Days are sorted Mon→Fri.

---

## 4. UI Layout

### Password bar (always visible at top)
- **Locked state:** password input + "Mở khóa" button
- **Unlocked state:** green "✅ Đã xác thực" badge + "Đổi" link to re-enter password
- Password stored in component state only — clears on page reload

### Week selector
- Same chevron `◀ Tuần 17 · 2026 ▶` style as existing `DebtPage`
- Admin can navigate to any week (no upper limit)

### Day cards (scrollable list)
One card per day that has orders, sorted Monday to Friday:

```
┌─ T2 21/04 ──────────────────── Tổng: 250k ─┐
│  [A] Nguyễn A    Tuần 17: [Chưa trả][✓Paid] │
│      • Phở bò đặc biệt   45k  [✏] [🗑]      │
│      • Trà sữa            35k  [✏] [🗑]      │
│      Tổng: 80k   [~ Đã trả riêng hôm này]   │
│                                              │
│  [B] Trần B      Tuần 17: [✓ Đã trả]        │
│      • Cơm gà             55k  [✏] [🗑]      │
│      Tổng: 55k                               │
└──────────────────────────────────────────────┘
```

### Person row detail
| Element | Locked | Unlocked |
|---|---|---|
| View orders | ✅ | ✅ |
| Badge tuần (paid/pending) | read-only | clickable toggle |
| [✏] edit order | hidden | visible |
| [🗑] delete order | hidden | visible |
| [~ Đã trả riêng] exclude day | hidden | visible toggle |

### Edit order modal
Opens when clicking ✏ on an order:
- Dropdown to select a different menu item (from that day's menu)
- Note text input
- Cancel / Save buttons
- Calls `PUT /api/orders/:id`

### Delete order
- Clicking 🗑 shows an inline confirm ("Xóa?  [Có] [Không]") on the row — no modal
- Calls `DELETE /api/orders/:id`

---

## 5. Data Flow

```
Page mount
  → GET /api/orders/week?week=X&year=Y   (orders + IDs + exclusions + payment status)

Unlock
  → Save password to useState — no API call, validated lazily on first mutation

Toggle paid/unpaid
  → POST /api/debts/override { person_name, week, year, status, password }
  → Refetch week data

Toggle exclude day
  → POST /api/debts/exclude-day { person_name, date, excluded, password }
  → Refetch week data

Edit order
  → PUT /api/orders/:id { menu_item_id, addon_ids }
  → Refetch week data

Delete order
  → DELETE /api/orders/:id
  → Refetch week data
```

**SSE listeners** (via existing `useSSE` hook):
- `debt_updated` → refetch
- `order_submitted` → refetch
- `order_deleted` → refetch

Wrong-password errors surface as an inline red message with a prompt to re-enter password (clears unlocked state).

---

## 6. Error Handling

- Wrong password on any mutation → clear session password, show "Sai mật khẩu — nhập lại" inline
- Network error → show toast/inline error, do not clear password
- Order not found (already deleted) → refetch silently

---

## 7. Out of Scope

- Adding new orders from this page (use existing order flow)
- Exporting to CSV
- Bulk mark-all-paid action
