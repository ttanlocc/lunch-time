// client/src/pages/OrderPage.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { NameSelector } from '../components/NameSelector.jsx';
import { MenuList } from '../components/MenuList.jsx';
import { ConfirmBanner } from '../components/ConfirmBanner.jsx';

function getKnownNames(orders) {
  return [...new Set(orders.map(o => o.person_name))];
}

export function OrderPage() {
  const [menu, setMenu] = useState({ items: [], is_locked: false });
  const [orders, setOrders] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  // { 'Cơm': itemId, 'Bún': itemId, ... } — one per food-type group
  const [selectedByType, setSelectedByType] = useState({});
  const [addonQtys, setAddonQtys] = useState({});
  const [note, setNote] = useState('');
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
    order_submitted: (data) => setOrders(prev => {
      if (data.orders) {
        const filtered = prev.filter(o => o.person_name !== data.person_name);
        return [...filtered, ...data.orders];
      } else if (data.order) {
        const filtered = prev.filter(o => o.person_name !== data.order.person_name);
        return [...filtered, data.order];
      }
      return prev;
    }),
    order_cancelled: ({ person_name }) => setOrders(prev => prev.filter(o => o.person_name !== person_name)),
    order_locked: () => setMenu(m => ({ ...m, is_locked: true })),
    order_confirmed: (data) => setConfirmation(data),
  });

  function handleSelectMain(foodType, itemId) {
    setSelectedByType(prev => {
      // toggle: clicking same item deselects it
      if (prev[foodType] === itemId) {
        const { [foodType]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [foodType]: itemId };
    });
  }

  function handleAddonQty(id, delta) {
    setAddonQtys(prev => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      if (next === 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: next };
    });
  }

  function resetSelection() {
    setSelectedByType({});
    setAddonQtys({});
    setNote('');
  }

  function toggleNotePreset(preset) {
    setNote(prev => {
      const parts = prev.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.includes(preset)) return parts.filter(p => p !== preset).join(', ');
      return [...parts, preset].join(', ');
    });
  }

  async function handleCancel() {
    if (!selectedName) return;
    setSubmitting(true);
    try {
      await api.cancelMyOrder(selectedName);
      resetSelection();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!selectedName || selectedMainItems.length === 0) return;
    setSubmitting(true);
    try {
      const [primaryItem, ...otherMainItems] = selectedMainItems;
      const extraMainIds = otherMainItems.map(i => i.id);
      const extraAddonIds = Object.entries(addonQtys).flatMap(([id, qty]) => Array(qty).fill(+id));
      const extra_ids = [...extraMainIds, ...extraAddonIds];
      await api.submitOrder({ person_name: selectedName, menu_item_id: primaryItem.id, extra_ids, note: note.trim() || null });
      if (!knownNames.includes(selectedName)) setKnownNames(n => [...n, selectedName]);
      setAddonQtys({});
      setNote('');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedMainItems = Object.values(selectedByType)
    .filter(Boolean)
    .map(id => menu.items.find(i => i.id === id))
    .filter(Boolean);

  const extraItems = menu.items.filter(i => i.category === 'extra' && addonQtys[i.id] > 0);
  const mainTotal = selectedMainItems.reduce((s, i) => s + i.price, 0);
  const extraTotal = extraItems.reduce((s, i) => s + i.price * (addonQtys[i.id] || 0), 0);
  const totalPrice = mainTotal + extraTotal;
  const hasSelection = selectedMainItems.length > 0 || extraItems.length > 0;

  const myCurrentOrders = selectedName ? orders.filter(o => o.person_name === selectedName && o.category !== 'extra') : [];
  const myCurrentExtras = selectedName ? orders.filter(o => o.person_name === selectedName && o.category === 'extra') : [];
  const hasCurrentOrder = myCurrentOrders.length > 0;

  const NOTE_PRESETS = ['Ít cơm', 'Nhiều cơm', 'Không hành', 'Ít cay', 'Không rau', 'Ít nước'];
  const notePresetSet = new Set(note.split(',').map(s => s.trim()).filter(Boolean));

  const orderedPeopleMap = new Map();
  for (const o of orders) {
    if (!orderedPeopleMap.has(o.person_name) || o.category !== 'extra') {
      orderedPeopleMap.set(o.person_name, o);
    }
  }
  const orderedPeople = [...orderedPeopleMap.values()];
  const orderedNames = new Set(orders.map(o => o.person_name));
  const allNames = [...new Set([...knownNames, ...orderedNames])];
  const canSubmit = selectedName && selectedMainItems.length > 0 && !submitting && !menu.is_locked;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--header-pad)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Order hôm nay</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {menu.is_locked
            ? <span style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', padding: '5px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700 }}>Đã chốt</span>
            : <span style={{ background: 'var(--gradient-primary)', color: '#fff', padding: '5px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 700 }}>Đang mở</span>
          }
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--content-pad-v) var(--content-pad-h)', display: 'grid', gridTemplateColumns: '1fr var(--content-right-col)', gap: 'var(--content-gap)', alignContent: 'start' }}>
        <div>
          <ConfirmBanner confirmedAt={confirmation.confirmed_at} confirmedBy={confirmation.confirmed_by} />
          <NameSelector names={allNames} selected={selectedName} onSelect={setSelectedName} />
          {menu.items.length === 0
            ? <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center', color: 'var(--color-text-light)', boxShadow: 'var(--shadow-card)' }}>
                Chưa có menu hôm nay — vào <strong>Import Menu</strong> để thêm
              </div>
            : <MenuList items={menu.items} selectedByType={selectedByType} addonQtys={addonQtys} onSelectMain={handleSelectMain} onAddonQty={handleAddonQty} />
          }
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 10 }}>Order của bạn</div>

            {hasCurrentOrder && (
              <div style={{ background: 'var(--color-success-light)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-success)' }}>Đã order</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginTop: 2 }}>
                    {myCurrentOrders.map(o => o.item_name).join(', ')}
                    {myCurrentExtras.length > 0 && <span style={{ color: '#0891b2' }}> + {myCurrentExtras.map(o => o.item_name).join(', ')}</span>}
                  </div>
                  {myCurrentOrders[0]?.note && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>📝 {myCurrentOrders[0].note}</div>}
                </div>
                <button onClick={handleCancel} disabled={submitting || menu.is_locked} style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 'none',
                  background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 700,
                  cursor: submitting || menu.is_locked ? 'not-allowed' : 'pointer', flexShrink: 0,
                }}>Hủy</button>
              </div>
            )}

            <div style={{ background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))', borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--color-secondary)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Đang chọn</div>
              {hasSelection ? (
                <>
                  {selectedMainItems.map(item => (
                    <div key={item.id} style={{ fontSize: 13, fontWeight: 700 }}>{item.name}</div>
                  ))}
                  {extraItems.length > 0 && (
                    <div style={{ fontSize: 12, color: '#0891b2', marginTop: 2 }}>
                      + {extraItems.map(e => addonQtys[e.id] > 1 ? `${e.name} x${addonQtys[e.id]}` : e.name).join(', ')}
                    </div>
                  )}
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-primary)', margin: '6px 0 12px' }}>{Math.round(totalPrice).toLocaleString('en-US')}đ</div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--color-text-light)', margin: '8px 0 12px' }}>Chưa chọn món</div>
              )}

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>Ghi chú</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                  {NOTE_PRESETS.map(p => {
                    const active = notePresetSet.has(p);
                    return (
                      <button key={p} onClick={() => toggleNotePreset(p)} style={{
                        padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 600,
                        border: '1.5px solid', cursor: 'pointer',
                        borderColor: active ? 'transparent' : 'var(--color-border)',
                        background: active ? 'var(--gradient-primary)' : 'var(--color-card)',
                        color: active ? '#fff' : 'var(--color-text-muted)',
                        transition: 'all var(--transition-fast)',
                      }}>{p}</button>
                    );
                  })}
                </div>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Hoặc nhập ghi chú..."
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--color-border)', background: 'var(--color-card)', fontSize: 12, color: 'var(--color-text)', outline: 'none', fontFamily: 'inherit' }} />
              </div>

              <button onClick={handleSubmit} disabled={!canSubmit} style={{
                width: '100%', padding: 11, borderRadius: 'var(--radius-md)', border: 'none',
                background: canSubmit ? 'var(--gradient-primary)' : 'var(--color-border)',
                color: canSubmit ? '#fff' : 'var(--color-text-light)',
                fontSize: 13, fontWeight: 700,
                boxShadow: canSubmit ? 'var(--shadow-button)' : 'none',
                transition: 'all var(--transition-fast)',
              }}>
                {submitting ? 'Đang lưu...' : 'Xác nhận order ✓'}
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-card)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 10 }}>
              Đã order ({orderedPeople.length}/{allNames.length || '?'})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {orderedPeople.map(o => (
                <div key={o.person_name} title={o.note ? `Ghi chú: ${o.note}` : undefined} style={{ padding: '5px 12px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                  {o.person_name} ✓{o.note ? ' 📝' : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
