// client/src/components/MenuList.jsx

function AddonWidget({ addons, selectedAddonIds, onToggleAddon }) {
  if (!addons?.length) return null;
  return (
    <div style={{ margin: '4px 0 6px 44px', background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', borderRadius: 10, padding: '9px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#a855f7', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>➕ Gọi thêm</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {addons.map(a => (
          <button key={a.id} onClick={() => onToggleAddon(a.id)} style={{
            padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
            borderColor: selectedAddonIds.includes(a.id) ? 'transparent' : '#e0d6f0',
            background: selectedAddonIds.includes(a.id) ? 'linear-gradient(135deg,#f9a8d4,#c084fc)' : '#fff',
            color: selectedAddonIds.includes(a.id) ? '#fff' : '#7c6f8e',
          }}>
            {selectedAddonIds.includes(a.id) ? '✓ ' : ''}{a.name} +{a.price / 1000}k
          </button>
        ))}
      </div>
    </div>
  );
}

export function MenuList({ items, selectedItemId, selectedAddonIds, onSelectItem, onToggleAddon }) {
  const categories = [
    { id: 'main', label: '🍚 Món chính' },
    { id: 'extra', label: '➕ Gọi thêm' },
  ];

  const byCategory = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 12 }}>
        Menu hôm nay
      </div>
      {Object.entries(byCategory).map(([cat, catItems]) => (
        <div key={cat}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#bbb', letterSpacing: 1, margin: '10px 0 6px', paddingLeft: 2 }}>
            {categories.find(c => c.id === cat)?.label || cat}
          </div>
          {catItems.map(item => (
            <div key={item.id}>
              <div onClick={() => onSelectItem(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 10, cursor: 'pointer', border: '1.5px solid',
                borderColor: selectedItemId === item.id ? '#f9a8d4' : 'transparent',
                background: selectedItemId === item.id ? '#fdf0f8' : 'transparent',
                transition: 'all 0.15s',
              }}>
                <div style={{
                  width: 21, height: 21, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                  background: selectedItemId === item.id ? 'linear-gradient(135deg,#f9a8d4,#c084fc)' : 'none',
                  border: selectedItemId === item.id ? 'none' : '2px solid #e0d6f0',
                  color: selectedItemId === item.id ? '#fff' : 'transparent',
                }}>
                  {selectedItemId === item.id ? '✓' : ''}
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: selectedItemId === item.id ? '#ec4899' : '#bbb' }}>
                  {(item.price / 1000).toFixed(0)}k
                </div>
              </div>
              {selectedItemId === item.id && (
                <AddonWidget addons={item.addons} selectedAddonIds={selectedAddonIds} onToggleAddon={onToggleAddon} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
