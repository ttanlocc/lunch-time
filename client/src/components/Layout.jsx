// client/src/components/Layout.jsx
export function Layout({ children }) {
  return (
    <div style={{
      display: 'flex', height: '100vh', background: '#fff',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      color: '#2d2d3a', overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}
