// client/src/components/MenuList.jsx
import { useState } from 'react';

function QtyControl({ qty, onDec, onInc, color = '#06b6d4' }) {
  const base = { width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--transition-fast)', flexShrink: 0 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={e => e.stopPropagation()}>
      {qty > 0 && <button onClick={onDec} style={{ ...base, background: color + '22', color }}>-</button>}
      {qty > 0 && <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 16, textAlign: 'center' }}>{qty}</span>}
      <button onClick={onInc} style={{ ...base, background: color + '22', color }}>+</button>
    </div>
  );
}

const FOOD_TYPE_CONFIG = {
  'Cơm':      { icon: '🍚', color: '#ec4899' },
  'Bún':      { icon: '🍜', color: '#f97316' },
  'Mì':       { icon: '🍝', color: '#eab308' },
  'Nui':      { icon: '🥗', color: '#84cc16' },
  'Gọi thêm': { icon: '➕', color: '#06b6d4' },
};

const TYPE_ORDER = ['Cơm', 'Bún', 'Mì', 'Nui', 'Gọi thêm'];

function getFoodType(item) {
  if (item.category === 'extra') return 'Gọi thêm';
  const name = item.name.toLowerCase();
  if (name.startsWith('bún')) return 'Bún';
  if (name.startsWith('mì'))  return 'Mì';
  if (name.startsWith('nui')) return 'Nui';
  return 'Cơm';
}

// selectedByType: { 'Cơm': itemId, 'Bún': itemId, ... }
// addonQtys: { [itemId]: qty }
export function MenuList({ items, selectedByType, addonQtys, onSelectMain, onAddonQty }) {
  const byFoodType = {};
  for (const item of items) {
    const t = getFoodType(item);
    if (!byFoodType[t]) byFoodType[t] = [];
    byFoodType[t].push(item);
  }

  const tabs = TYPE_ORDER.filter(t => byFoodType[t]);
  const [activeTab, setActiveTab] = useState(tabs[0] ?? '');

  const config = FOOD_TYPE_CONFIG[activeTab] || { icon: '📦', color: 'var(--color-secondary)' };
  const activeItems = byFoodType[activeTab] ?? [];
  const isExtraTab = activeTab === 'Gọi thêm';

  return (
    <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 12px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)', overflowX: 'auto' }}>
        {tabs.map(t => {
          const isActive = t === activeTab;
          const cfg = FOOD_TYPE_CONFIG[t] || {};
          const hasSelection = t === 'Gọi thêm'
            ? Object.keys(addonQtys).some(id => byFoodType[t]?.some(i => i.id === +id) && addonQtys[id] > 0)
            : selectedByType[t] != null;
          return (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '7px 14px', borderRadius: 'var(--radius-pill)', border: '1.5px solid',
              borderColor: isActive ? 'transparent' : hasSelection ? cfg.color + '60' : 'var(--color-border)',
              background: isActive ? `linear-gradient(135deg, ${cfg.color}22, ${cfg.color}11)` : hasSelection ? cfg.color + '10' : 'transparent',
              color: isActive ? cfg.color : hasSelection ? cfg.color : 'var(--color-text-muted)',
              fontSize: 13, fontWeight: isActive || hasSelection ? 700 : 500,
              cursor: 'pointer', transition: 'all var(--transition-fast)',
            }}>
              <span style={{ fontSize: 15 }}>{cfg.icon}</span>
              {t}
              {hasSelection && !isActive && <span style={{ fontSize: 10, background: cfg.color, color: '#fff', borderRadius: 99, padding: '1px 5px', fontWeight: 700 }}>✓</span>}
              {!hasSelection && (
                <span style={{ fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: 'center', background: isActive ? cfg.color : 'var(--color-border)', color: isActive ? '#fff' : 'var(--color-text-muted)', borderRadius: 99, padding: '1px 6px', transition: 'all var(--transition-fast)' }}>
                  {byFoodType[t].length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ padding: '8px 6px' }}>
        {isExtraTab ? (
          // Gọi thêm: qty stepper for each extra item
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 6px' }}>
            {activeItems.map(item => {
              const qty = addonQtys[item.id] || 0;
              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px 8px 14px', borderRadius: 'var(--radius-pill)', border: '1.5px solid',
                  borderColor: qty > 0 ? 'transparent' : 'var(--color-border)',
                  background: qty > 0 ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'var(--color-card)',
                  transition: 'all var(--transition-fast)',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: qty > 0 ? '#fff' : 'var(--color-text)' }}>{item.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: qty > 0 ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)' }}>+{(item.price / 1000).toFixed(0)}k</span>
                  <QtyControl qty={qty} onDec={() => onAddonQty(item.id, -1)} onInc={() => onAddonQty(item.id, 1)} color={qty > 0 ? '#fff' : '#06b6d4'} />
                </div>
              );
            })}
          </div>
        ) : (
          // Main dish tabs: single select per group (radio-style)
          activeItems.map(item => {
            const isSelected = selectedByType[activeTab] === item.id;
            return (
              <div key={item.id} onClick={() => onSelectMain(activeTab, item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1.5px solid',
                borderColor: isSelected ? config.color + '60' : 'transparent',
                background: isSelected ? config.color + '12' : 'transparent',
                transition: 'all var(--transition-fast)', marginBottom: 2,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                  background: isSelected ? `linear-gradient(135deg, ${config.color}, ${config.color}99)` : 'none',
                  border: isSelected ? 'none' : '2px solid var(--color-border)',
                  color: isSelected ? '#fff' : 'transparent',
                }}>
                  {isSelected ? '✓' : ''}
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: isSelected ? config.color : 'var(--color-text-muted)',
                  background: isSelected ? config.color + '15' : 'var(--color-border)',
                  padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                }}>
                  {(item.price / 1000).toFixed(0)}k
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
