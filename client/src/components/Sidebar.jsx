// client/src/components/Sidebar.jsx
const NAV = [
  { id: 'order', icon: '🍱', label: 'Order hôm nay' },
  { id: 'import', icon: '📥', label: 'Import menu' },
  { id: 'summary', icon: '📋', label: 'Tổng hợp đơn' },
  { id: 'debt', icon: '💰', label: 'Công nợ' },
];

export function Sidebar({ current, onNavigate, weekLabel }) {
  return (
    <aside style={{
      width: 200, flexShrink: 0,
      background: 'linear-gradient(180deg,#fce7f3 0%,#ede9fe 100%)',
      padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4,
      borderRight: '1px solid rgba(255,255,255,0.6)',
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18, padding: '0 4px', background: 'linear-gradient(135deg,#ec4899,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        🍱 LunchTime
      </div>
      {NAV.map(item => (
        <button key={item.id} onClick={() => onNavigate(item.id)} style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '9px 11px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: current === item.id ? 700 : 500,
          background: current === item.id ? '#fff' : 'transparent',
          color: current === item.id ? '#ec4899' : '#7c6f8e',
          boxShadow: current === item.id ? '0 2px 8px rgba(236,72,153,0.1)' : 'none',
          width: '100%', textAlign: 'left',
        }}>
          <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: '9px 11px', fontSize: 11, color: '#7c6f8e' }}>
        <strong style={{ display: 'block', color: '#ec4899', fontSize: 12, marginBottom: 2 }}>{weekLabel}</strong>
        Tuần hiện tại
      </div>
    </aside>
  );
}
