# LunchTime — Design Spec

**Date:** 2026-04-20  
**Stack:** React + Vite (frontend) · Express.js + SQLite (backend) · PM2 + Nginx (deploy on Azure)

---

## Problem

Nhóm ~6 người ăn trưa cùng nhau mỗi ngày. Pain points:
- Người chốt đơn phải tổng hợp thủ công, copy paste lên Zalo group khác
- Tính tiền cuối tuần mất công, không rõ ai đã trả chưa
- Menu thay đổi mỗi ngày, gõ lại tốn thời gian

---

## Users & Roles

| Role | Mô tả |
|---|---|
| **Member** | Chọn món, xem nợ, quét QR trả tiền |
| **Người chốt đơn** | Import menu, lock đơn, copy tổng hợp gửi Zalo |

Không có auth. App public — nhận diện người dùng qua name chip (chọn tên từ danh sách có sẵn, hoặc nhập tên mới).

---

## Core Flows

### 1. Daily Menu Import
- Người chốt đơn paste text menu từ Zalo vào app
- App parse tự động theo pattern: `- Tên món [:]? giá k` và `+ addon || addon: giá k/phần`
- Hiển thị diff: Món mới (thêm vào DB) / Có hôm nay (bật) / Không có hôm nay (tắt)
- Confirm → menu live, order mở
- Idempotent: paste lại không tạo duplicate

### 2. Order Flow
- Member chọn tên từ chip (danh sách lấy từ lịch sử orders)
- Chọn món theo category tab (Cơm / Bún / Mì / Nui)
- Nếu món có add-on (vd Cơm sườn), widget inline xuất hiện bên dưới để chọn bì/chả/ốp la
- Submit → order saved, realtime broadcast đến tất cả clients
- Auto-lock lúc 11:00 mỗi ngày (node-cron) + manual lock button

### 3. Order Summary
- Hiển thị danh sách order group by món (vì người chốt cần biết số lượng từng món)
- Text copy-ready format cho Zalo: `📋 ORDER 21/04\n- Cơm gà: An, Bình (×2)\n...`
- 1-click copy

### 4. Debt Tracking & Payment
- Tính nợ theo tuần (T2–T6), hiển thị per-person
- Người chưa trả: nút "Hiện QR" → modal với VietQR QR code
- QR embed sẵn: số tài khoản + số tiền + nội dung `Lunch Tuan {xx} {TenNguoi}`
- SePay webhook (`POST /api/webhook/sepay`) nhận callback khi có chuyển khoản đúng nội dung
- Server match nội dung → update payment status → broadcast realtime qua SSE
- Tất cả clients đang mở app tự cập nhật trạng thái (xanh/đỏ) ngay lập tức

---

## Data Model (SQLite)

```sql
-- Master menu items (seed from paste, persisted across days)
menu_items (id, name, price, category, created_at)

-- Add-ons linked to menu items (vd bì/chả/ốp la cho Cơm sườn)
menu_addons (id, menu_item_id, name, price)

-- Daily availability toggle
daily_menu (id, menu_item_id, date, is_available)

-- Orders per person per day
orders (id, person_name, menu_item_id, date, created_at)
order_addons (id, order_id, addon_id)

-- Payment tracking per week
-- amount = sum of orders for that person that week (calculated at QR generation time)
payments (id, person_name, week_number, year, amount, paid_at, sepay_ref, status)
```

---

## API Routes

```
GET  /api/menu/today              — menu items available today
POST /api/menu/import             — parse & apply pasted menu text
POST /api/menu/lock               — manual lock today's orders
GET  /api/orders/today            — all orders for today
POST /api/orders                  — submit order
GET  /api/debts?week=17&year=2026 — debt summary by week
GET  /api/events                  — SSE stream for realtime updates
POST /api/webhook/sepay           — SePay payment callback
```

---

## Realtime Updates (SSE)

- Backend: Express SSE endpoint `GET /api/events`
- Events pushed: `order_submitted`, `order_locked`, `payment_confirmed`
- Frontend: `EventSource('/api/events')` → update React state on event
- Tất cả tabs/browsers nhận update ngay khi có order mới hoặc payment confirmed

---

## Payment Flow

```
User quét QR (VietQR)
  → Chuyển khoản với nội dung "Lunch Tuan 17 Chi"
  → SePay nhận giao dịch
  → SePay POST /api/webhook/sepay { content: "Lunch Tuan 17 Chi", amount: 160000 }
  → Server parse: week=17, name="Chi"
  → Update payments table: status=paid
  → SSE broadcast: { type: "payment_confirmed", person: "Chi", week: 17 }
  → All connected clients update UI ngay lập tức
```

VietQR URL format:
```
https://img.vietqr.io/image/{BANK}-{ACCOUNT}-compact2.png
  ?amount={AMOUNT}
  &addInfo=Lunch%20Tuan%20{WEEK}%20{NAME}
  &accountName=LUNCH%20TEAM
```

---

## Menu Parser Logic

```
Input: raw Zalo text
Rules:
  - Lines starting with `-`: extract "name price" → menu item
  - Lines starting with `+`: extract addon names & price (split by `||`), associate with the most recently parsed `-` item
  - "Gọi thêm:" section: items parsed as standalone extras (not linked to a parent item)
  - Price format: "35k" → 35000, "5k/phần" → 5000
  - Fuzzy match against existing DB items (normalize: trim, remove punctuation)
  - Idempotent: upsert by normalized name

Output:
  - new_items[]: added to menu_items table
  - available[]: daily_menu toggled ON for today
  - unavailable[]: daily_menu toggled OFF for today
  - addons[]: linked to parent menu item
```

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + Vite | Fast build, component model |
| Backend | Express.js | Lightweight, easy SSE, webhook handling |
| Database | SQLite (better-sqlite3) | Zero config, sufficient for 6 users |
| Process | PM2 | Auto-restart, logs |
| Reverse proxy | Nginx | HTTPS, serve static |
| QR | VietQR API | Free, universal Vietnamese banking QR |
| Payment webhook | SePay | Auto-detect bank transfers by content |

---

## UI Design

- Desktop-first (không làm mobile)
- Color theme: pastel blue-pink (`#fce7f3` → `#ede9fe` → `#93c5fd`)
- Layout: Left sidebar (200px) + main content area
- 4 screens: Order · Import Menu · Tổng hợp · Công nợ
- Name selection: chip buttons (tên từ lịch sử) thay vì free-text input
- Add-on: inline widget xuất hiện dưới món được chọn
- Payment: modal QR từ VietQR, auto-close sau khi SePay xác nhận

---

## Deployment (Azure)

```
/home/azureuser/aiq/lunch-time/
  ├── server/          # Express API (port 3001)
  ├── client/          # React + Vite build
  ├── data/            # SQLite file (lunch.db)
  └── ecosystem.config.js  # PM2 config

Nginx: serve client/dist/ as static, proxy /api/* → localhost:3001
HTTPS: Let's Encrypt (certbot)
```

---

## Out of Scope (MVP)

- Mobile app
- AI/LLM integration (menu parsing dùng regex)
- Push notifications
- Multi-tenant (nhiều nhóm khác nhau)
- Export báo cáo
- VietQR deeplink (dùng QR trước)
