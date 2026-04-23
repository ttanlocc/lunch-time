# Teams Bot — Daily Menu Card

**Date:** 2026-04-23  
**Status:** Approved

## Goal

Cho phép thành viên team order cơm trưa trực tiếp trong Microsoft Teams mà không cần mở web app. Bot gửi menu card vào group channel mỗi sáng, user bấm chọn món ngay trong chat.

## Architecture

```
Cron job (7:30 sáng)
    → gọi Teams Bot API
        → gửi Adaptive Card vào group channel
            → user click chọn món
                → Teams gửi invoke POST → Bot server
                    → Bot gọi existing POST /api/orders
                        → SSE broadcast → web app update realtime
```

Bot là layer mỏng phía trên backend hiện tại — không thay đổi database hay API.

## Components

### 1. Azure Bot Registration

- Đăng ký bot trên Azure Portal (miễn phí, không cần Azure hosting)
- Lấy `TEAMS_APP_ID` và `TEAMS_APP_SECRET` → lưu vào `.env`
- Bot endpoint chạy trên server hiện tại (Express)

### 2. Bot Route (`server/src/routes/bot.js`)

Nhận `Activity` từ Teams Bot Framework SDK:

- **`conversationUpdate`**: Bot được add vào channel → lưu `serviceUrl` + `conversationId` để dùng khi proactive send
- **`invoke` (action submit)**: User bấm nút chọn món
  - Lấy `activity.from.name` làm `person_name` (không cần hỏi "Bạn là ai?")
  - Gọi `POST /api/orders` với `{ person_name, menu_item_id }`
  - Update card: hiện "✅ [Tên] đã chọn [Món]"

Dependencies: `botbuilder` (Microsoft Bot Framework SDK for Node.js)

### 3. Adaptive Card Template

Card được build từ menu hôm nay:

```
┌─────────────────────────────────┐
│  🍱 Menu hôm nay — Thứ X DD/MM  │
├─────────────────────────────────┤
│  Cơm                            │
│  [Cơm sườn 35k] [Cơm gà 30k]   │
│  Bún                            │
│  [Bún bò 30k]                   │
│  ...                            │
└─────────────────────────────────┘
```

- Nhóm theo `category` (Cơm/Bún/Mì/Nui) — giống web
- Mỗi nút là `Action.Submit` với `{ menu_item_id }`
- Sau khi order thành công, card update tại chỗ (không gửi card mới)

### 4. Cron Job

File: `server/src/jobs/sendDailyMenu.js`

- Chạy lúc 7:30 sáng mỗi ngày (thêm vào `ecosystem.config.js`)
- Fetch menu từ DB → build Adaptive Card → gọi Teams API `proactiveMessage`
- Nếu không có menu hôm nay → không gửi (không spam)

### 5. Teams App Manifest

Thư mục `teams-app/` với:
- `manifest.json` — khai báo bot, permissions
- `color.png` + `outline.png` — icon app
- Đóng gói thành `.zip` → upload lên Teams Admin hoặc sideload

## Data Flow chi tiết

```
7:30am: sendDailyMenu.js
  → db.getMenuToday()
  → buildAdaptiveCard(menuItems)
  → bot.sendProactiveMessage(conversationId, card)

User bấm "Cơm sườn":
  Teams POST /api/bot
  → verifyTeamsSignature(req)       ← bảo mật
  → person_name = activity.from.name
  → POST /api/orders { person_name, menu_item_id: 5 }
  → broadcast SSE → web update
  → updateCard "✅ An đã chọn Cơm sườn"
```

## Security

- Verify request signature từ Teams bằng `JwtTokenValidation` của Bot Framework SDK — reject request không hợp lệ
- `TEAMS_APP_ID` và `TEAMS_APP_SECRET` chỉ lưu trong `.env`, không commit

## Out of Scope

- Chọn addon (Gọi thêm) qua Teams card — vẫn dùng web app nếu cần addon
- Cancel order qua Teams — dùng web app
- Thông báo tổng hợp cuối ngày (có thể thêm sau)

## Files cần tạo/sửa

| File | Action |
|------|--------|
| `server/src/routes/bot.js` | Tạo mới |
| `server/src/jobs/sendDailyMenu.js` | Tạo mới |
| `server/src/index.js` | Mount `/api/bot` route |
| `ecosystem.config.js` | Thêm cron job 7:30am |
| `teams-app/manifest.json` | Tạo mới |
| `teams-app/color.png` | Tạo mới |
| `teams-app/outline.png` | Tạo mới |
| `.env` | Thêm `TEAMS_APP_ID`, `TEAMS_APP_SECRET`, `TEAMS_CONVERSATION_ID` |
| `package.json` (server) | Thêm `botbuilder` dependency |
