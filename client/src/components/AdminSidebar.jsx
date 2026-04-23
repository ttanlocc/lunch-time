import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { UtensilsCrossed, ClipboardList, CreditCard, Settings2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `Tuần ${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

export function AdminSidebar() {
  const [unmatchedCount, setUnmatchedCount] = useState(0);

  useEffect(() => {
    api.getUnmatched().then(d => setUnmatchedCount(d.events.length)).catch(() => {});
  }, []);

  useSSE({
    payment_queued: () => setUnmatchedCount(c => c + 1),
    payment_confirmed: () => {},
  });

  const NAV = [
    { to: '/admin', icon: UtensilsCrossed, label: 'Order hôm nay' },
    { to: '/admin/summary', icon: ClipboardList, label: 'Tổng hợp' },
    { to: '/admin/debt', icon: CreditCard, label: 'Công nợ' },
    { to: '/admin/manage', icon: Settings2, label: 'Quản lý nợ' },
    { to: '/admin/unmatched', icon: AlertCircle, label: 'Chờ xử lý', badge: unmatchedCount },
  ];

  return (
    <aside style={{
      width: 'var(--sidebar-width)', flexShrink: 0,
      background: 'var(--gradient-sidebar)',
      padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 4,
      borderRight: '1px solid rgba(255,255,255,0.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, padding: '0 4px' }}>
        <span style={{ fontSize: 16, fontWeight: 800, background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          LunchTime
        </span>
        <span style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-pill)', letterSpacing: '0.5px' }}>
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
          transition: 'all var(--transition-fast)',
        })}>
          <item.icon size={16} strokeWidth={2} />
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.badge > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
              {item.badge}
            </span>
          )}
        </NavLink>
      ))}
      <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius-sm)', padding: '9px 11px', fontSize: 12, color: 'var(--color-text-muted)' }}>
        <strong style={{ display: 'block', color: 'var(--color-primary)', fontSize: 12, marginBottom: 2 }}>{getWeekLabel()}</strong>
        Tuần hiện tại
      </div>
    </aside>
  );
}
