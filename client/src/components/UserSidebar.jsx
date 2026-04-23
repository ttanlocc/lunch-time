// client/src/components/UserSidebar.jsx
import { NavLink } from 'react-router-dom';
import { UtensilsCrossed, ClipboardList, CreditCard } from 'lucide-react';

const NAV = [
  { to: '/', icon: UtensilsCrossed, label: 'Order hôm nay' },
  { to: '/summary', icon: ClipboardList, label: 'Tổng hợp' },
  { to: '/debt', icon: CreditCard, label: 'Công nợ' },
];

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `Tuần ${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

export function UserSidebar() {
  return (
    <aside style={{
      width: 'var(--sidebar-width)', flexShrink: 0,
      background: 'var(--gradient-sidebar)',
      padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 4,
      borderRight: '1px solid rgba(255,255,255,0.6)',
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, padding: '0 4px', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        LunchTime
      </div>
      {NAV.map(item => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: isActive ? 700 : 500,
          background: isActive ? 'var(--color-card)' : 'transparent',
          color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
          boxShadow: isActive ? 'var(--shadow-card)' : 'none',
          textDecoration: 'none',
          transition: 'all var(--transition-fast)',
        })}>
          <item.icon size={16} strokeWidth={2} />
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
