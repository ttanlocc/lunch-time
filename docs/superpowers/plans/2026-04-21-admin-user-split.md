# Admin/User Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split LunchTime app into User (`/`) and Admin (`/admin`) routes with polished UI.

**Architecture:** React Router for routing, shared components with separate layouts/sidebars per role. Backend gets new endpoints for order confirmation and admin override.

**Tech Stack:** React, React Router v6, Express, SQLite, SSE

---

## File Structure

```
client/src/
  styles/
    variables.css          (NEW - CSS custom properties)
  layouts/
    UserLayout.jsx         (NEW - user app layout)
    AdminLayout.jsx        (NEW - admin app layout)
  components/
    UserSidebar.jsx        (NEW - 3 nav items)
    AdminSidebar.jsx       (NEW - 4 nav items + ADMIN badge)
    ConfirmBanner.jsx      (NEW - "Đã đặt cơm" banner)
    OverrideModal.jsx      (NEW - admin edit order modal)
    Sidebar.jsx            (DELETE after migration)
    Layout.jsx             (DELETE after migration)
  pages/
    OrderPage.jsx          (MODIFY - remove lock button for user)
    SummaryPage.jsx        (MODIFY - add copy confirm + banner)
    AdminOrderPage.jsx     (NEW - order page with override + lock)
  App.jsx                  (MODIFY - add React Router)
  main.jsx                 (MODIFY - wrap with BrowserRouter)
  index.css                (MODIFY - import variables.css)

server/src/
  routes/orders.js         (MODIFY - add PUT, DELETE, confirm endpoints)
```

---

### Task 1: Install React Router

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install react-router-dom**

```bash
cd /home/azureuser/aiq/lunch-time/client && npm install react-router-dom
```

- [ ] **Step 2: Verify installation**

```bash
grep react-router-dom /home/azureuser/aiq/lunch-time/client/package.json
```

Expected: `"react-router-dom": "^6.x.x"`

- [ ] **Step 3: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/package.json client/package-lock.json && git commit -m "chore: add react-router-dom"
```

---

### Task 2: Create CSS Variables

**Files:**
- Create: `client/src/styles/variables.css`
- Modify: `client/src/index.css`

- [ ] **Step 1: Create variables.css**

```css
/* client/src/styles/variables.css */
:root {
  --color-primary: #ec4899;
  --color-primary-light: #fce7f3;
  --color-secondary: #a855f7;
  --color-secondary-light: #ede9fe;
  --color-success: #059669;
  --color-success-light: #d1fae5;
  --color-text: #2d2d3a;
  --color-text-muted: #7c6f8e;
  --color-text-light: #aaa;
  --color-border: #f5f0fb;
  --color-bg: #fdf8ff;
  --color-card: #fff;
  
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 14px;
  --radius-pill: 20px;
  
  --shadow-card: 0 2px 12px rgba(180, 140, 220, 0.1);
  --shadow-button: 0 4px 14px rgba(192, 132, 252, 0.35);
  
  --gradient-primary: linear-gradient(135deg, #f9a8d4, #c084fc);
  --gradient-sidebar: linear-gradient(180deg, #fce7f3 0%, #ede9fe 100%);
  --gradient-header: linear-gradient(135deg, #f9a8d4 0%, #c084fc 50%, #93c5fd 100%);
}
```

- [ ] **Step 2: Import in index.css**

Replace `client/src/index.css` with:

```css
@import './styles/variables.css';

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; color: var(--color-text); }
button { font-family: inherit; }
input, textarea { font-family: inherit; }
```

- [ ] **Step 3: Create styles directory**

```bash
mkdir -p /home/azureuser/aiq/lunch-time/client/src/styles
```

- [ ] **Step 4: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/styles/variables.css client/src/index.css && git commit -m "feat: add CSS variables for design system"
```

---

### Task 3: Create UserSidebar Component

**Files:**
- Create: `client/src/components/UserSidebar.jsx`

- [ ] **Step 1: Create UserSidebar.jsx**

```jsx
// client/src/components/UserSidebar.jsx
import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', icon: '🍱', label: 'Order hôm nay' },
  { to: '/import', icon: '📥', label: 'Import menu' },
  { to: '/summary', icon: '📋', label: 'Tổng hợp' },
];

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `Tuần ${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

export function UserSidebar() {
  return (
    <aside style={{
      width: 200, flexShrink: 0,
      background: 'var(--gradient-sidebar)',
      padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4,
      borderRight: '1px solid rgba(255,255,255,0.6)',
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, padding: '0 4px', background: 'linear-gradient(135deg,#ec4899,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        🍱 LunchTime
      </div>
      {NAV.map(item => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 700 : 500,
          background: isActive ? 'var(--color-card)' : 'transparent',
          color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
          boxShadow: isActive ? 'var(--shadow-card)' : 'none',
          textDecoration: 'none',
        })}>
          <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
      <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', fontSize: 11, color: 'var(--color-text-muted)' }}>
        <strong style={{ display: 'block', color: 'var(--color-primary)', fontSize: 12, marginBottom: 2 }}>{getWeekLabel()}</strong>
        Tuần hiện tại
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/components/UserSidebar.jsx && git commit -m "feat: add UserSidebar component"
```

---

### Task 4: Create AdminSidebar Component

**Files:**
- Create: `client/src/components/AdminSidebar.jsx`

- [ ] **Step 1: Create AdminSidebar.jsx**

```jsx
// client/src/components/AdminSidebar.jsx
import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/admin', icon: '🍱', label: 'Order hôm nay' },
  { to: '/admin/summary', icon: '📋', label: 'Tổng hợp' },
  { to: '/admin/debt', icon: '💰', label: 'Công nợ' },
];

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `Tuần ${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

export function AdminSidebar() {
  return (
    <aside style={{
      width: 200, flexShrink: 0,
      background: 'var(--gradient-sidebar)',
      padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4,
      borderRight: '1px solid rgba(255,255,255,0.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, padding: '0 4px' }}>
        <span style={{ fontSize: 16, fontWeight: 800, background: 'linear-gradient(135deg,#ec4899,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          🍱 LunchTime
        </span>
        <span style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-pill)', letterSpacing: '0.5px' }}>
          ADMIN
        </span>
      </div>
      {NAV.map(item => (
        <NavLink key={item.to} to={item.to} end style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 700 : 500,
          background: isActive ? 'var(--color-card)' : 'transparent',
          color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
          boxShadow: isActive ? 'var(--shadow-card)' : 'none',
          textDecoration: 'none',
        })}>
          <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
      <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', fontSize: 11, color: 'var(--color-text-muted)' }}>
        <strong style={{ display: 'block', color: 'var(--color-primary)', fontSize: 12, marginBottom: 2 }}>{getWeekLabel()}</strong>
        Tuần hiện tại
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/components/AdminSidebar.jsx && git commit -m "feat: add AdminSidebar component with ADMIN badge"
```

---

### Task 5: Create Layout Components

**Files:**
- Create: `client/src/layouts/UserLayout.jsx`
- Create: `client/src/layouts/AdminLayout.jsx`

- [ ] **Step 1: Create layouts directory**

```bash
mkdir -p /home/azureuser/aiq/lunch-time/client/src/layouts
```

- [ ] **Step 2: Create UserLayout.jsx**

```jsx
// client/src/layouts/UserLayout.jsx
import { Outlet } from 'react-router-dom';
import { UserSidebar } from '../components/UserSidebar.jsx';

export function UserLayout() {
  return (
    <div style={{
      display: 'flex', height: '100vh', background: 'var(--color-card)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      color: 'var(--color-text)', overflow: 'hidden',
    }}>
      <UserSidebar />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create AdminLayout.jsx**

```jsx
// client/src/layouts/AdminLayout.jsx
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from '../components/AdminSidebar.jsx';

export function AdminLayout() {
  return (
    <div style={{
      display: 'flex', height: '100vh', background: 'var(--color-card)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      color: 'var(--color-text)', overflow: 'hidden',
    }}>
      <AdminSidebar />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/layouts && git commit -m "feat: add UserLayout and AdminLayout components"
```

---

### Task 6: Add Backend Confirmation Endpoint

**Files:**
- Modify: `server/src/routes/orders.js`

- [ ] **Step 1: Add confirmation columns migration check**

The `daily_menu` table needs `confirmed_at` and `confirmed_by`. Check if migration needed:

```bash
cd /home/azureuser/aiq/lunch-time && sqlite3 server/data/lunch.db ".schema daily_menu"
```

- [ ] **Step 2: Add confirm endpoint to orders.js**

Add at the end of `server/src/routes/orders.js` before the closing:

```javascript
// POST /api/orders/confirm - mark order as placed
ordersRouter.post('/confirm', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const { person_name } = req.body;

  if (!person_name) {
    return res.status(400).json({ error: 'person_name required' });
  }

  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE daily_menu 
    SET confirmed_at = ?, confirmed_by = ? 
    WHERE date = ?
  `).run(now, person_name, today);

  const confirmation = { confirmed_at: now, confirmed_by: person_name, date: today };
  broadcast('order_confirmed', confirmation);
  res.json(confirmation);
});

// GET /api/orders/confirmation - get today's confirmation status
ordersRouter.get('/confirmation', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  
  const row = db.prepare('SELECT confirmed_at, confirmed_by FROM daily_menu WHERE date = ? LIMIT 1').get(today);
  res.json({ 
    confirmed_at: row?.confirmed_at || null, 
    confirmed_by: row?.confirmed_by || null 
  });
});

// PUT /api/orders/:id - admin override order
ordersRouter.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { menu_item_id, addon_ids = [] } = req.body;

  if (!menu_item_id) {
    return res.status(400).json({ error: 'menu_item_id required' });
  }

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const update = db.transaction(() => {
    db.prepare('DELETE FROM order_addons WHERE order_id = ?').run(id);
    db.prepare('UPDATE orders SET menu_item_id = ? WHERE id = ?').run(menu_item_id, id);
    
    for (const addon_id of addon_ids) {
      db.prepare('INSERT INTO order_addons (order_id, addon_id) VALUES (?, ?)').run(id, addon_id);
    }
  });

  update();

  const order = db.prepare(`
    SELECT o.id, o.person_name, mi.name as item_name, mi.price,
           GROUP_CONCAT(ma.name) as addon_names
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    LEFT JOIN order_addons oa ON oa.order_id = o.id
    LEFT JOIN menu_addons ma ON ma.id = oa.addon_id
    WHERE o.id = ?
    GROUP BY o.id
  `).get(id);

  broadcast('order_submitted', { order, date: existing.date });
  res.json(order);
});

// DELETE /api/orders/:id - admin delete order
ordersRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }

  db.prepare('DELETE FROM order_addons WHERE order_id = ?').run(id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);

  broadcast('order_deleted', { id, person_name: existing.person_name, date: existing.date });
  res.json({ deleted: true, id });
});
```

- [ ] **Step 3: Run database migration for confirmation columns**

```bash
cd /home/azureuser/aiq/lunch-time && sqlite3 server/data/lunch.db "ALTER TABLE daily_menu ADD COLUMN confirmed_at TEXT; ALTER TABLE daily_menu ADD COLUMN confirmed_by TEXT;"
```

- [ ] **Step 4: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add server/src/routes/orders.js && git commit -m "feat: add order confirmation and admin override endpoints"
```

---

### Task 7: Add API Client Methods

**Files:**
- Modify: `client/src/lib/api.js`

- [ ] **Step 1: Add new API methods**

Add to the `api` object in `client/src/lib/api.js`:

```javascript
export const api = {
  getMenuToday: () => request('GET', '/menu/today'),
  previewMenu: (text) => request('POST', '/menu/preview', { text }),
  importMenu: (text) => request('POST', '/menu/import', { text }),
  lockMenu: () => request('POST', '/menu/lock'),
  getOrdersToday: () => request('GET', '/orders/today'),
  submitOrder: (body) => request('POST', '/orders', body),
  getDebts: (week, year) => request('GET', `/debts?week=${week}&year=${year}`),
  // New methods
  confirmOrder: (person_name) => request('POST', '/orders/confirm', { person_name }),
  getConfirmation: () => request('GET', '/orders/confirmation'),
  updateOrder: (id, body) => request('PUT', `/orders/${id}`, body),
  deleteOrder: (id) => request('DELETE', `/orders/${id}`),
};
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/lib/api.js && git commit -m "feat: add API methods for confirmation and admin override"
```

---

### Task 8: Create ConfirmBanner Component

**Files:**
- Create: `client/src/components/ConfirmBanner.jsx`

- [ ] **Step 1: Create ConfirmBanner.jsx**

```jsx
// client/src/components/ConfirmBanner.jsx
export function ConfirmBanner({ confirmedAt, confirmedBy }) {
  if (!confirmedAt) {
    return (
      <div style={{
        background: 'var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
        color: 'var(--color-text-light)',
        fontSize: 13,
      }}>
        <span style={{ fontSize: 16 }}>⏳</span>
        Chưa ai đặt cơm
      </div>
    );
  }

  const time = new Date(confirmedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      background: 'var(--color-success-light)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
      color: 'var(--color-success)',
      fontSize: 13,
      fontWeight: 600,
    }}>
      <span style={{ fontSize: 16 }}>✅</span>
      Đã đặt lúc {time} bởi {confirmedBy}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/components/ConfirmBanner.jsx && git commit -m "feat: add ConfirmBanner component"
```

---

### Task 9: Create OverrideModal Component

**Files:**
- Create: `client/src/components/OverrideModal.jsx`

- [ ] **Step 1: Create OverrideModal.jsx**

```jsx
// client/src/components/OverrideModal.jsx
import { useState, useEffect } from 'react';

export function OverrideModal({ order, menuItems, onSave, onDelete, onClose }) {
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);

  useEffect(() => {
    if (order && menuItems.length > 0) {
      const item = menuItems.find(i => i.name === order.item_name);
      if (item) {
        setSelectedItemId(item.id);
        if (order.addon_names) {
          const addonNames = order.addon_names.split(',');
          const addonIds = item.addons?.filter(a => addonNames.includes(a.name)).map(a => a.id) || [];
          setSelectedAddonIds(addonIds);
        }
      }
    }
  }, [order, menuItems]);

  const selectedItem = menuItems.find(i => i.id === selectedItemId);

  function handleToggleAddon(id) {
    setSelectedAddonIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleSave() {
    if (!selectedItemId) return;
    onSave({ menu_item_id: selectedItemId, addon_ids: selectedAddonIds });
  }

  if (!order) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--color-card)', borderRadius: 'var(--radius-lg)',
        padding: 20, width: 400, maxHeight: '80vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
          Sửa order: {order.person_name}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Chọn món
        </div>
        <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
          {menuItems.filter(i => i.category === 'main').map(item => (
            <div key={item.id} onClick={() => { setSelectedItemId(item.id); setSelectedAddonIds([]); }}
              style={{
                padding: '8px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: selectedItemId === item.id ? 'var(--color-primary-light)' : 'transparent',
                border: selectedItemId === item.id ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
                marginBottom: 4, fontSize: 13,
              }}>
              {item.name} — {item.price / 1000}k
            </div>
          ))}
        </div>

        {selectedItem?.addons?.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Gọi thêm
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {selectedItem.addons.map(a => (
                <button key={a.id} onClick={() => handleToggleAddon(a.id)} style={{
                  padding: '5px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: '1.5px solid',
                  borderColor: selectedAddonIds.includes(a.id) ? 'transparent' : 'var(--color-border)',
                  background: selectedAddonIds.includes(a.id) ? 'var(--gradient-primary)' : 'var(--color-card)',
                  color: selectedAddonIds.includes(a.id) ? '#fff' : 'var(--color-text-muted)',
                }}>
                  {selectedAddonIds.includes(a.id) ? '✓ ' : ''}{a.name} +{a.price / 1000}k
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} style={{
            flex: 1, padding: 11, borderRadius: 'var(--radius-md)', border: 'none',
            background: 'var(--gradient-primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            Lưu thay đổi
          </button>
          <button onClick={() => onDelete(order.id)} style={{
            padding: '11px 16px', borderRadius: 'var(--radius-md)', border: 'none',
            background: '#fee2e2', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            Xóa
          </button>
          <button onClick={onClose} style={{
            padding: '11px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--color-border)',
            background: 'var(--color-card)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/components/OverrideModal.jsx && git commit -m "feat: add OverrideModal for admin order editing"
```

---

### Task 10: Update OrderPage (User Version)

**Files:**
- Modify: `client/src/pages/OrderPage.jsx`

- [ ] **Step 1: Update OrderPage to remove lock button and add ConfirmBanner**

Replace `client/src/pages/OrderPage.jsx` with:

```jsx
// client/src/pages/OrderPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { NameSelector } from '../components/NameSelector.jsx';
import { MenuList } from '../components/MenuList.jsx';
import { ConfirmBanner } from '../components/ConfirmBanner.jsx';

function getKnownNames(orders) {
  const set = new Set(orders.map(o => o.person_name));
  return [...set];
}

export function OrderPage() {
  const [menu, setMenu] = useState({ items: [], is_locked: false });
  const [orders, setOrders] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [knownNames, setKnownNames] = useState([]);
  const [confirmation, setConfirmation] = useState({ confirmed_at: null, confirmed_by: null });

  useEffect(() => {
    api.getMenuToday().then(setMenu);
    api.getOrdersToday().then(d => {
      setOrders(d.orders);
      setKnownNames(getKnownNames(d.orders));
    });
    api.getConfirmation().then(setConfirmation);
  }, []);

  useSSE({
    order_submitted: ({ order }) => setOrders(prev => {
      const filtered = prev.filter(o => o.person_name !== order.person_name);
      return [...filtered, order];
    }),
    order_locked: () => setMenu(m => ({ ...m, is_locked: true })),
    order_confirmed: (data) => setConfirmation(data),
  });

  function handleSelectItem(id) {
    setSelectedItemId(id);
    setSelectedAddonIds([]);
  }

  function handleToggleAddon(id) {
    setSelectedAddonIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSubmit() {
    if (!selectedName || !selectedItemId) return;
    setSubmitting(true);
    try {
      await api.submitOrder({ person_name: selectedName, menu_item_id: selectedItemId, addon_ids: selectedAddonIds });
      if (!knownNames.includes(selectedName)) setKnownNames(n => [...n, selectedName]);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedItem = menu.items.find(i => i.id === selectedItemId);
  const totalPrice = selectedItem
    ? selectedItem.price + selectedAddonIds.reduce((sum, id) => {
        const addon = selectedItem.addons?.find(a => a.id === id);
        return sum + (addon?.price || 0);
      }, 0)
    : 0;

  const orderedNames = new Set(orders.map(o => o.person_name));
  const allNames = [...new Set([...knownNames, ...orderedNames])];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Order hôm nay</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {menu.is_locked
            ? <span style={{ background: 'var(--color-primary-light)', color: '#e11d48', padding: '5px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700 }}>🔒 Đã chốt</span>
            : <span style={{ background: 'var(--gradient-primary)', color: '#fff', padding: '5px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700, opacity: 0.8 }}>⏳ Đang mở</span>
          }
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignContent: 'start' }}>
        <div>
          <ConfirmBanner confirmedAt={confirmation.confirmed_at} confirmedBy={confirmation.confirmed_by} />
          <NameSelector names={allNames} selected={selectedName} onSelect={setSelectedName} />
          {menu.items.length === 0
            ? <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center', color: 'var(--color-text-light)', boxShadow: 'var(--shadow-card)' }}>
                Chưa có menu hôm nay — vào <strong>Import Menu</strong> để thêm
              </div>
            : <MenuList items={menu.items} selectedItemId={selectedItemId} selectedAddonIds={selectedAddonIds} onSelectItem={handleSelectItem} onToggleAddon={handleToggleAddon} />
          }
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 10 }}>Order của bạn</div>
            <div style={{ background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))', borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--color-secondary)', fontWeight: 700, marginBottom: 4 }}>ĐANG CHỌN</div>
              {selectedItem
                ? <>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedItem.name}</div>
                    {selectedAddonIds.length > 0 && <div style={{ fontSize: 11, color: 'var(--color-secondary)', marginTop: 2 }}>+ {selectedAddonIds.map(id => selectedItem.addons?.find(a => a.id === id)?.name).join(', ')}</div>}
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-primary)', margin: '6px 0 12px' }}>{(totalPrice / 1000).toFixed(0)},000đ</div>
                  </>
                : <div style={{ fontSize: 13, color: 'var(--color-text-light)', margin: '8px 0 12px' }}>Chưa chọn món</div>
              }
              <button onClick={handleSubmit} disabled={!selectedName || !selectedItemId || submitting || menu.is_locked} style={{
                width: '100%', padding: 11, borderRadius: 'var(--radius-md)', border: 'none',
                background: selectedName && selectedItemId && !menu.is_locked ? 'var(--gradient-primary)' : '#e0d6f0',
                color: selectedName && selectedItemId && !menu.is_locked ? '#fff' : 'var(--color-text-light)',
                fontSize: 13, fontWeight: 700, cursor: selectedName && selectedItemId && !menu.is_locked ? 'pointer' : 'not-allowed',
                boxShadow: selectedName && selectedItemId ? 'var(--shadow-button)' : 'none',
              }}>
                {submitting ? 'Đang lưu...' : 'Xác nhận order ✓'}
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 10 }}>
              Đã order ({orders.length}/{allNames.length || '?'})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {orders.map(o => (
                <span key={o.id} style={{ padding: '5px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                  {o.person_name} ✓
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/pages/OrderPage.jsx && git commit -m "feat: update OrderPage for user view with ConfirmBanner"
```

---

### Task 11: Create AdminOrderPage

**Files:**
- Create: `client/src/pages/AdminOrderPage.jsx`

- [ ] **Step 1: Create AdminOrderPage.jsx**

```jsx
// client/src/pages/AdminOrderPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { NameSelector } from '../components/NameSelector.jsx';
import { MenuList } from '../components/MenuList.jsx';
import { ConfirmBanner } from '../components/ConfirmBanner.jsx';
import { OverrideModal } from '../components/OverrideModal.jsx';

function getKnownNames(orders) {
  const set = new Set(orders.map(o => o.person_name));
  return [...set];
}

export function AdminOrderPage() {
  const [menu, setMenu] = useState({ items: [], is_locked: false });
  const [orders, setOrders] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [knownNames, setKnownNames] = useState([]);
  const [confirmation, setConfirmation] = useState({ confirmed_at: null, confirmed_by: null });
  const [editingOrder, setEditingOrder] = useState(null);

  useEffect(() => {
    api.getMenuToday().then(setMenu);
    api.getOrdersToday().then(d => {
      setOrders(d.orders);
      setKnownNames(getKnownNames(d.orders));
    });
    api.getConfirmation().then(setConfirmation);
  }, []);

  useSSE({
    order_submitted: ({ order }) => setOrders(prev => {
      const filtered = prev.filter(o => o.person_name !== order.person_name);
      return [...filtered, order];
    }),
    order_locked: () => setMenu(m => ({ ...m, is_locked: true })),
    order_confirmed: (data) => setConfirmation(data),
    order_deleted: ({ id }) => setOrders(prev => prev.filter(o => o.id !== id)),
  });

  function handleSelectItem(id) {
    setSelectedItemId(id);
    setSelectedAddonIds([]);
  }

  function handleToggleAddon(id) {
    setSelectedAddonIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSubmit() {
    if (!selectedName || !selectedItemId) return;
    setSubmitting(true);
    try {
      await api.submitOrder({ person_name: selectedName, menu_item_id: selectedItemId, addon_ids: selectedAddonIds });
      if (!knownNames.includes(selectedName)) setKnownNames(n => [...n, selectedName]);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLock() {
    await api.lockMenu();
    setMenu(m => ({ ...m, is_locked: true }));
  }

  async function handleOverrideSave(data) {
    await api.updateOrder(editingOrder.id, data);
    setEditingOrder(null);
  }

  async function handleOverrideDelete(id) {
    await api.deleteOrder(id);
    setEditingOrder(null);
  }

  const selectedItem = menu.items.find(i => i.id === selectedItemId);
  const totalPrice = selectedItem
    ? selectedItem.price + selectedAddonIds.reduce((sum, id) => {
        const addon = selectedItem.addons?.find(a => a.id === id);
        return sum + (addon?.price || 0);
      }, 0)
    : 0;

  const orderedNames = new Set(orders.map(o => o.person_name));
  const allNames = [...new Set([...knownNames, ...orderedNames])];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Order hôm nay</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {menu.is_locked
            ? <span style={{ background: 'var(--color-primary-light)', color: '#e11d48', padding: '5px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700 }}>🔒 Đã chốt</span>
            : <span style={{ background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))', color: 'var(--color-secondary)', padding: '5px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700 }}>⏳ Đang mở</span>
          }
          {!menu.is_locked && (
            <button onClick={handleLock} style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'linear-gradient(135deg,#fca5a5,#f472b6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔒 Chốt đơn
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignContent: 'start' }}>
        <div>
          <ConfirmBanner confirmedAt={confirmation.confirmed_at} confirmedBy={confirmation.confirmed_by} />
          <NameSelector names={allNames} selected={selectedName} onSelect={setSelectedName} />
          {menu.items.length === 0
            ? <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center', color: 'var(--color-text-light)', boxShadow: 'var(--shadow-card)' }}>
                Chưa có menu hôm nay
              </div>
            : <MenuList items={menu.items} selectedItemId={selectedItemId} selectedAddonIds={selectedAddonIds} onSelectItem={handleSelectItem} onToggleAddon={handleToggleAddon} />
          }
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 10 }}>Order của bạn</div>
            <div style={{ background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))', borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--color-secondary)', fontWeight: 700, marginBottom: 4 }}>ĐANG CHỌN</div>
              {selectedItem
                ? <>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedItem.name}</div>
                    {selectedAddonIds.length > 0 && <div style={{ fontSize: 11, color: 'var(--color-secondary)', marginTop: 2 }}>+ {selectedAddonIds.map(id => selectedItem.addons?.find(a => a.id === id)?.name).join(', ')}</div>}
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-primary)', margin: '6px 0 12px' }}>{(totalPrice / 1000).toFixed(0)},000đ</div>
                  </>
                : <div style={{ fontSize: 13, color: 'var(--color-text-light)', margin: '8px 0 12px' }}>Chưa chọn món</div>
              }
              <button onClick={handleSubmit} disabled={!selectedName || !selectedItemId || submitting || menu.is_locked} style={{
                width: '100%', padding: 11, borderRadius: 'var(--radius-md)', border: 'none',
                background: selectedName && selectedItemId && !menu.is_locked ? 'var(--gradient-primary)' : '#e0d6f0',
                color: selectedName && selectedItemId && !menu.is_locked ? '#fff' : 'var(--color-text-light)',
                fontSize: 13, fontWeight: 700, cursor: selectedName && selectedItemId && !menu.is_locked ? 'pointer' : 'not-allowed',
                boxShadow: selectedName && selectedItemId ? 'var(--shadow-button)' : 'none',
              }}>
                {submitting ? 'Đang lưu...' : 'Xác nhận order ✓'}
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 10 }}>
              Đã order ({orders.length}/{allNames.length || '?'})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {orders.map(o => (
                <span key={o.id} onClick={() => setEditingOrder(o)} style={{ 
                  padding: '5px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, 
                  background: 'var(--color-success-light)', color: 'var(--color-success)', 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {o.person_name} ✓
                  <span style={{ fontSize: 10, opacity: 0.7 }}>✏️</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <OverrideModal 
        order={editingOrder} 
        menuItems={menu.items} 
        onSave={handleOverrideSave} 
        onDelete={handleOverrideDelete} 
        onClose={() => setEditingOrder(null)} 
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/pages/AdminOrderPage.jsx && git commit -m "feat: add AdminOrderPage with lock button and override"
```

---

### Task 12: Update SummaryPage with Copy Confirm

**Files:**
- Modify: `client/src/pages/SummaryPage.jsx`

- [ ] **Step 1: Update SummaryPage**

Replace `client/src/pages/SummaryPage.jsx` with:

```jsx
// client/src/pages/SummaryPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { ConfirmBanner } from '../components/ConfirmBanner.jsx';

function buildZaloText(orders, date) {
  const groups = {};
  for (const o of orders) {
    const key = o.addon_names ? `${o.item_name}+${o.addon_names}` : o.item_name;
    if (!groups[key]) groups[key] = { label: o.addon_names ? `${o.item_name} + ${o.addon_names}` : o.item_name, people: [], unitPrice: o.price };
    groups[key].people.push(o.person_name);
  }
  const total = orders.reduce((sum, o) => sum + (o.price || 0), 0);
  const d = new Date(date);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const lines = [`📋 ORDER ${dateStr}`];
  for (const g of Object.values(groups)) {
    const count = g.people.length > 1 ? ` (×${g.people.length})` : '';
    lines.push(`- ${g.label}: ${g.people.join(', ')}${count}`);
  }
  lines.push(`💰 Tổng: ${total / 1000}k`);
  return lines.join('\n');
}

const DOT_COLORS = ['#f472b6', '#c084fc', '#93c5fd', '#6ee7b7', '#fbbf24', '#f87171'];

export function SummaryPage({ isAdmin = false }) {
  const [data, setData] = useState({ orders: [], is_locked: false, date: '' });
  const [confirmation, setConfirmation] = useState({ confirmed_at: null, confirmed_by: null });
  const [copyPerson, setCopyPerson] = useState('');

  useEffect(() => { 
    api.getOrdersToday().then(setData); 
    api.getConfirmation().then(setConfirmation);
  }, []);

  useSSE({
    order_submitted: () => api.getOrdersToday().then(setData),
    order_locked: () => setData(d => ({ ...d, is_locked: true })),
    order_confirmed: (c) => setConfirmation(c),
  });

  const groups = {};
  for (const o of data.orders) {
    const key = o.addon_names ? `${o.item_name}+${o.addon_names}` : o.item_name;
    if (!groups[key]) groups[key] = { label: o.addon_names ? `${o.item_name} + ${o.addon_names}` : o.item_name, people: [], total: 0 };
    groups[key].people.push(o.person_name);
    groups[key].total += o.price || 0;
  }
  const groupList = Object.values(groups);
  const grandTotal = data.orders.reduce((sum, o) => sum + (o.price || 0), 0);
  const zaloText = buildZaloText(data.orders, data.date || new Date().toISOString());

  async function handleCopy() {
    await navigator.clipboard.writeText(zaloText);
    if (copyPerson) {
      await api.confirmOrder(copyPerson);
    }
  }

  const uniqueNames = [...new Set(data.orders.map(o => o.person_name))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Tổng hợp đơn</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{data.orders.length} người đã order</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && !data.is_locked && (
            <button onClick={() => api.lockMenu().then(() => setData(d => ({ ...d, is_locked: true })))}
              style={{ padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'linear-gradient(135deg,#fca5a5,#f472b6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔒 Chốt đơn
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 260px', gap: 14, alignContent: 'start' }}>
        <div>
          <ConfirmBanner confirmedAt={confirmation.confirmed_at} confirmedBy={confirmation.confirmed_by} />
          
          <div style={{ background: 'var(--gradient-header)', borderRadius: 'var(--radius-lg)', padding: 18, color: '#fff', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 3 }}>Tổng hôm nay</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1 }}>{(grandTotal / 1000).toFixed(0)},000đ</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{data.orders.length} người · {groupList.length} món</div>
            </div>
            <div style={{ fontSize: 48, opacity: 0.2 }}>💰</div>
          </div>

          {groupList.map((g, i) => (
            <div key={g.label} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-card)', marginBottom: 7, boxShadow: 'var(--shadow-card)', gap: 10 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: DOT_COLORS[i % DOT_COLORS.length], flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{g.label}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{g.people.join(', ')} · ×{g.people.length}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>{(g.total / 1000).toFixed(0)}k</div>
            </div>
          ))}

          {groupList.length === 0 && (
            <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center', color: 'var(--color-text-light)', boxShadow: 'var(--shadow-card)' }}>
              Chưa có order nào hôm nay
            </div>
          )}
        </div>

        <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)' }}>Text gửi Zalo</div>
          <pre style={{ background: '#1e1e2e', borderRadius: 'var(--radius-md)', padding: 13, fontFamily: 'monospace', fontSize: 12, color: '#a0e0a0', lineHeight: 1.8, whiteSpace: 'pre-wrap', flex: 1 }}>{zaloText}</pre>
          
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginTop: 4 }}>Ai đang đặt?</div>
          <select value={copyPerson} onChange={e => setCopyPerson(e.target.value)} style={{
            padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--color-border)',
            fontSize: 13, background: 'var(--color-card)', color: 'var(--color-text)',
          }}>
            <option value="">Chọn tên...</option>
            {uniqueNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          <button onClick={handleCopy} disabled={!copyPerson} style={{ 
            padding: 11, borderRadius: 'var(--radius-md)', border: 'none', 
            background: copyPerson ? 'linear-gradient(135deg,#a7f3d0,#6ee7b7)' : '#e0d6f0', 
            color: copyPerson ? '#065f46' : 'var(--color-text-light)', 
            fontSize: 13, fontWeight: 700, cursor: copyPerson ? 'pointer' : 'not-allowed' 
          }}>
            📋 Copy & Xác nhận đã đặt
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/pages/SummaryPage.jsx && git commit -m "feat: update SummaryPage with copy confirm flow"
```

---

### Task 13: Update App.jsx with React Router

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/main.jsx`

- [ ] **Step 1: Update main.jsx**

Replace `client/src/main.jsx` with:

```jsx
// client/src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 2: Update App.jsx**

Replace `client/src/App.jsx` with:

```jsx
// client/src/App.jsx
import { Routes, Route } from 'react-router-dom';
import { UserLayout } from './layouts/UserLayout.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { OrderPage } from './pages/OrderPage.jsx';
import { ImportMenuPage } from './pages/ImportMenuPage.jsx';
import { SummaryPage } from './pages/SummaryPage.jsx';
import { AdminOrderPage } from './pages/AdminOrderPage.jsx';
import { DebtPage } from './pages/DebtPage.jsx';

export default function App() {
  return (
    <Routes>
      {/* User routes */}
      <Route element={<UserLayout />}>
        <Route path="/" element={<OrderPage />} />
        <Route path="/import" element={<ImportMenuPage />} />
        <Route path="/summary" element={<SummaryPage />} />
      </Route>

      {/* Admin routes */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminOrderPage />} />
        <Route path="/admin/summary" element={<SummaryPage isAdmin />} />
        <Route path="/admin/debt" element={<DebtPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add client/src/App.jsx client/src/main.jsx && git commit -m "feat: add React Router with user and admin routes"
```

---

### Task 14: Clean Up Old Components

**Files:**
- Delete: `client/src/components/Sidebar.jsx`
- Delete: `client/src/components/Layout.jsx`

- [ ] **Step 1: Delete old Sidebar.jsx and Layout.jsx**

```bash
rm /home/azureuser/aiq/lunch-time/client/src/components/Sidebar.jsx /home/azureuser/aiq/lunch-time/client/src/components/Layout.jsx
```

- [ ] **Step 2: Commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add -A && git commit -m "chore: remove old Sidebar and Layout components"
```

---

### Task 15: Test and Verify

- [ ] **Step 1: Start dev server**

```bash
cd /home/azureuser/aiq/lunch-time/client && npm run dev
```

- [ ] **Step 2: Verify routes**

- Open `http://localhost:5173/` — should show User layout with 3 sidebar items
- Open `http://localhost:5173/admin` — should show Admin layout with ADMIN badge and 4 sidebar items
- Test order flow on both pages
- Test copy + confirm flow on Summary page
- Test admin override by clicking on a person's name in "Đã order"

- [ ] **Step 3: Final commit**

```bash
cd /home/azureuser/aiq/lunch-time && git add -A && git commit -m "feat: complete admin/user split implementation"
```
