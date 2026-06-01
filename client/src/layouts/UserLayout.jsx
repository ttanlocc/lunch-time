// client/src/layouts/UserLayout.jsx
import { Outlet } from 'react-router-dom';

export function UserLayout() {
  return (
    <div style={{
      display: 'flex', height: '100dvh', background: 'var(--color-card)',
      color: 'var(--color-text)', overflow: 'hidden',
    }}>
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
