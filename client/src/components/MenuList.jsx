// client/src/components/MenuList.jsx

function AddonWidget({ addons, selectedAddonIds, onToggleAddon }) {
  if (!addons?.length) return null;
  return (
    <div style={{ margin: '4px 0 6px 44px', background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-secondary-light))', borderRadius: 'var(--radius-sm)', padding: '9px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>➕ Gọi thêm</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {addons.map(a => (
          <button key={a.id} onClick={() => onToggleAddon(a.id)} style={{
            padding: '5px 13px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
            borderColor: selectedAddonIds.includes(a.id) ? 'transparent' : 'var(--color-border)',
            background: selectedAddonIds.includes(a.id) ? 'var(--gradient-primary)' : 'var(--color-card)',
            color: selectedAddonIds.includes(a.id) ? '#fff' : 'var(--color-text-muted)',
          }}>
            {selectedAddonIds.includes(a.id) ? '✓ ' : ''}{a.name} +{a.price / 1000}k
          </button>
        ))}
      </div>
    </div>
  );
}

const FOOD_TYPE_CONFIG = {
  'Cơm': { icon: '🍚', color: '#ec4899' },
  'Bún': { icon: '🍜', color: '#f97316' },
  'Mì': { icon: '🍝', color: '#eab308' },
  'Nui': { icon: '🥗', color: '#84cc16' },
  'Gọi thêm': { icon: '➕', color: '#06b6d4' },
};

function getFoodType(item) {
  if (item.category === 'extra') return 'Gọi thêm';
  const name = item.name.toLowerCase();
  if (name.startsWith('bún')) return 'Bún';
  if (name.startsWith('mì')) return 'Mì';
  if (name.startsWith('nui')) return 'Nui';
  // Default to Cơm for everything else (cơm, kho, rim, etc.)
  return 'Cơm';
}

function CategoryCard({ category, items, selectedItemId, selectedAddonIds, onSelectItem, onToggleAddon }) {
  const config = FOOD_TYPE_CONFIG[category] || { icon: '📦', color: '#7c6f8e' };
  const isAddonCategory = category === 'Gọi thêm';

  return (
    <div style={{
      background: 'var(--color-card)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
    }}>
      {/* Category Header */}
      <div style={{
        background: `linear-gradient(135deg, ${config.color}15, ${config.color}08)`,
        borderBottom: `2px solid ${config.color}20`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>{config.icon}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: config.color }}>{category}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {items.length} món {isAddonCategory && '· chọn nhiều'}
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: 8 }}>
        {isAddonCategory ? (
          // Checkbox grid for add-ons (multi-select)
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px' }}>
            {items.map(item => {
              const isSelected = selectedAddonIds.includes(item.id);
              return (
                <button key={item.id} onClick={() => onToggleAddon(item.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 'var(--radius-pill)',
                  cursor: 'pointer', border: '1.5px solid',
                  borderColor: isSelected ? 'transparent' : 'var(--color-border)',
                  background: isSelected ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'var(--color-card)',
                  color: isSelected ? '#fff' : 'var(--color-text)',
                  fontSize: 13, fontWeight: 500,
                  transition: 'all 0.15s',
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    background: isSelected ? '#fff' : 'var(--color-border)',
                    color: isSelected ? '#06b6d4' : 'transparent',
                  }}>
                    {isSelected ? '✓' : ''}
                  </span>
                  {item.name}
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: isSelected ? '#fff' : 'var(--color-text-muted)',
                    opacity: isSelected ? 0.9 : 1,
                  }}>
                    +{(item.price / 1000).toFixed(0)}k
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          // Radio list for main dishes (single select)
          items.map(item => (
            <div key={item.id}>
              <div onClick={() => onSelectItem(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: '1.5px solid',
                borderColor: selectedItemId === item.id ? 'var(--color-primary)' : 'transparent',
                background: selectedItemId === item.id ? 'var(--color-primary-light)' : 'transparent',
                transition: 'all 0.15s',
                marginBottom: 2,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                  background: selectedItemId === item.id ? 'var(--gradient-primary)' : 'none',
                  border: selectedItemId === item.id ? 'none' : '2px solid var(--color-border)',
                  color: selectedItemId === item.id ? '#fff' : 'transparent',
                }}>
                  {selectedItemId === item.id ? '✓' : ''}
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: selectedItemId === item.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  background: selectedItemId === item.id ? 'transparent' : 'var(--color-border)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-pill)',
                }}>
                  {(item.price / 1000).toFixed(0)}k
                </div>
              </div>
              {selectedItemId === item.id && (
                <AddonWidget addons={item.addons} selectedAddonIds={selectedAddonIds} onToggleAddon={onToggleAddon} />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function MenuList({ items, selectedItemId, selectedAddonIds, onSelectItem, onToggleAddon }) {
  // Group by food type (Cơm, Bún, Mì, etc.)
  const byFoodType = {};
  for (const item of items) {
    const foodType = getFoodType(item);
    if (!byFoodType[foodType]) byFoodType[foodType] = [];
    byFoodType[foodType].push(item);
  }

  // Sort: Cơm → Bún → Mì → Nui → Gọi thêm
  const typeOrder = ['Cơm', 'Bún', 'Mì', 'Nui', 'Gọi thêm'];
  const sortedTypes = Object.keys(byFoodType).sort((a, b) => {
    return (typeOrder.indexOf(a) === -1 ? 99 : typeOrder.indexOf(a)) -
           (typeOrder.indexOf(b) === -1 ? 99 : typeOrder.indexOf(b));
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sortedTypes.map(foodType => (
        <CategoryCard
          key={foodType}
          category={foodType}
          items={byFoodType[foodType]}
          selectedItemId={selectedItemId}
          selectedAddonIds={selectedAddonIds}
          onSelectItem={onSelectItem}
          onToggleAddon={onToggleAddon}
        />
      ))}
    </div>
  );
}
