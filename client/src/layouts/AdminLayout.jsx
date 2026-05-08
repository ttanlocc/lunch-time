// client/src/layouts/AdminLayout.jsx
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from '../components/AdminSidebar.jsx';

export function AdminLayout() {
  return (
    <div style={{
      display: 'flex', height: '100vh', background: 'var(--color-card)',
      color: 'var(--color-text)', overflow: 'hidden',
    }}>
      <AdminSidebar />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
