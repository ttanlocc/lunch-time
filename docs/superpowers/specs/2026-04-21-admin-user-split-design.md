# Admin/User Split Design

## Overview
Tách app thành 2 phần: User (`/`) và Admin (`/admin`) với routing riêng, UI polish hơn.

## Architecture

### Routing
```
/                    → User App
  /                  → Order hôm nay
  /import            → Import menu  
  /summary           → Tổng hợp đơn (có nút Copy)

/admin               → Admin App
  /admin             → Order hôm nay (+ override)
  /admin/summary     → Tổng hợp đơn
  /admin/debt        → Công nợ
```

### Components
- **Shared:** `MenuList`, `NameSelector`, `QRModal`, `OrderPanel`
- **User-only:** `UserLayout`, `UserSidebar`
- **Admin-only:** `AdminLayout`, `AdminSidebar`, `OverrideModal`

## User Features

### User Sidebar (3 items)
- 🍱 Order hôm nay
- 📥 Import menu
- 📋 Tổng hợp

### Trang Order
- Chọn tên
- Chọn món từ menu
- Xác nhận order
- **KHÔNG có** nút Chốt đơn

### Trang Tổng hợp
- Xem danh sách order cả nhóm
- Nút **"📋 Copy đơn"** → copy text + gọi API `POST /api/orders/confirm`
- Banner **"✅ Đã đặt lúc {time} bởi {name}"** (SSE update)

### Trang Import menu
- Giữ nguyên như hiện tại

## Admin Features

### Admin Sidebar (4 items)
- 🍱 Order hôm nay
- 📋 Tổng hợp
- 💰 Công nợ
- Badge "ADMIN" cạnh logo

### Trang Order (Admin)
- Tất cả tính năng của User +
- Nút **"🔒 Chốt đơn"** trên topbar
- Trong "Đã order": mỗi người có icon ✏️ → **OverrideModal** để sửa/xóa order

### Override Flow
1. Admin click ✏️ trên tên người đã order
2. Modal hiện ra với:
   - Tên người (readonly)
   - Dropdown chọn lại món
   - Addon checkboxes
   - Nút Lưu / Xóa order
3. Gọi API `PUT /api/orders/:id` hoặc `DELETE /api/orders/:id`

### Trang Công nợ
- Giữ nguyên như hiện tại

## New Feature: Order Confirmation Tracker

### Backend
- Thêm columns vào bảng `menus`: `confirmed_at`, `confirmed_by`
- Endpoint: `POST /api/orders/confirm` → lưu timestamp + person_name
- SSE event: `order_confirmed` với `{ confirmed_at, confirmed_by }`

### Frontend
- Banner trên trang Order/Summary: "✅ Đã đặt lúc 12:05 bởi Lan"
- Nếu chưa confirm: banner mờ "Chưa ai đặt cơm"

## UI Polish

### CSS Variables (thay inline styles)
```css
:root {
  --color-primary: #ec4899;
  --color-primary-light: #fce7f3;
  --color-secondary: #a855f7;
  --color-secondary-light: #ede9fe;
  --radius-card: 14px;
  --radius-button: 10px;
  --shadow-card: 0 2px 12px rgba(180,140,220,0.1);
}
```

### Improvements
- Category headers (`MÓN CHÍNH`) đậm hơn, có divider
- Card shadows nhất quán
- Price: `35k` trong list, `35,000đ` trong panel
- Spacing đều hơn
- Hover states mượt hơn

## API Changes

### New Endpoints
- `POST /api/orders/confirm` - mark order as placed
- `PUT /api/orders/:id` - admin override order
- `DELETE /api/orders/:id` - admin delete order

### SSE Events
- `order_confirmed` - khi ai đó confirm đã đặt cơm

## File Structure
```
client/src/
  layouts/
    UserLayout.jsx
    AdminLayout.jsx
  components/
    UserSidebar.jsx
    AdminSidebar.jsx
    OverrideModal.jsx
    ConfirmBanner.jsx
  pages/
    user/
      OrderPage.jsx
      ImportMenuPage.jsx
      SummaryPage.jsx
    admin/
      AdminOrderPage.jsx
      AdminSummaryPage.jsx
      DebtPage.jsx
  styles/
    variables.css
```
