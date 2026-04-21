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
