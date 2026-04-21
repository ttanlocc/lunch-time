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
