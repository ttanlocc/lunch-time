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
