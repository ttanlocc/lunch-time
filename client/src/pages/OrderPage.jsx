// client/src/pages/OrderPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { NameSelector } from '../components/NameSelector.jsx';
import { MenuList } from '../components/MenuList.jsx';

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

  useEffect(() => {
    api.getMenuToday().then(setMenu);
    api.getOrdersToday().then(d => {
      setOrders(d.orders);
      setKnownNames(getKnownNames(d.orders));
    });
  }, []);

  useSSE({
    order_submitted: ({ order }) => setOrders(prev => {
      const filtered = prev.filter(o => o.person_name !== order.person_name);
      return [...filtered, order];
    }),
    order_locked: () => setMenu(m => ({ ...m, is_locked: true })),
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
      {/* Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #f5f0fb', background: '#fff', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Order hôm nay</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {menu.is_locked
            ? <span style={{ background: '#fce7f3', color: '#e11d48', padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>🔒 Đã chốt</span>
            : <span style={{ background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', color: '#a855f7', padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>⏳ Đang mở</span>
          }
          {!menu.is_locked && (
            <button onClick={() => api.lockMenu()} style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#fca5a5,#f472b6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🔒 Chốt đơn
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignContent: 'start' }}>
        <div>
          <NameSelector names={allNames} selected={selectedName} onSelect={setSelectedName} />
          {menu.items.length === 0
            ? <div style={{ background: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', color: '#bbb', boxShadow: '0 2px 8px rgba(180,140,220,0.07)' }}>
                Chưa có menu hôm nay — vào <strong>Import Menu</strong> để thêm
              </div>
            : <MenuList items={menu.items} selectedItemId={selectedItemId} selectedAddonIds={selectedAddonIds} onSelectItem={handleSelectItem} onToggleAddon={handleToggleAddon} />
          }
        </div>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 10 }}>Order của bạn</div>
            <div style={{ background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: '#a855f7', fontWeight: 700, marginBottom: 4 }}>ĐANG CHỌN</div>
              {selectedItem
                ? <>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedItem.name}</div>
                    {selectedAddonIds.length > 0 && <div style={{ fontSize: 11, color: '#a855f7', marginTop: 2 }}>+ {selectedAddonIds.map(id => selectedItem.addons?.find(a => a.id === id)?.name).join(', ')}</div>}
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#ec4899', margin: '6px 0 12px' }}>{(totalPrice / 1000).toFixed(0)},000đ</div>
                  </>
                : <div style={{ fontSize: 13, color: '#ccc', margin: '8px 0 12px' }}>Chưa chọn món</div>
              }
              <button onClick={handleSubmit} disabled={!selectedName || !selectedItemId || submitting || menu.is_locked} style={{
                width: '100%', padding: 11, borderRadius: 12, border: 'none',
                background: selectedName && selectedItemId && !menu.is_locked ? 'linear-gradient(135deg,#f9a8d4,#c084fc)' : '#e0d6f0',
                color: selectedName && selectedItemId && !menu.is_locked ? '#fff' : '#bbb',
                fontSize: 13, fontWeight: 700, cursor: selectedName && selectedItemId && !menu.is_locked ? 'pointer' : 'not-allowed',
                boxShadow: selectedName && selectedItemId ? '0 4px 14px rgba(192,132,252,0.35)' : 'none',
              }}>
                {submitting ? 'Đang lưu...' : 'Xác nhận order ✓'}
              </button>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 10 }}>
              Đã order ({orders.length}/{allNames.length || '?'})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {orders.map(o => (
                <span key={o.id} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#d1fae5', color: '#059669' }}>
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
