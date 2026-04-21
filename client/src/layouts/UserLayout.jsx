// client/src/layouts/UserLayout.jsx
import { Outlet } from 'react-router-dom';
import { UserSidebar } from '../components/UserSidebar.jsx';

export function UserLayout() {
  return (
    <div style={{
      display: 'flex', height: '100vh', background: 'var(--color-card)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      color: 'var(--color-text)', overflow: 'hidden',
    }}>
      <UserSidebar />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
