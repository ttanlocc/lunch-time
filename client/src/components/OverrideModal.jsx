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
