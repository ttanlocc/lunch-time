// client/src/components/ConfirmBanner.jsx
export function ConfirmBanner({ confirmedAt, confirmedBy }) {
  if (!confirmedAt) {
    return (
      <div style={{
        background: 'var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
        color: 'var(--color-text-light)',
        fontSize: 13,
      }}>
        <span style={{ fontSize: 16 }}>⏳</span>
        Chưa ai đặt cơm
      </div>
    );
  }

  const time = new Date(confirmedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      background: 'var(--color-success-light)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
      color: 'var(--color-success)',
      fontSize: 13,
      fontWeight: 600,
    }}>
      <span style={{ fontSize: 16 }}>✅</span>
      Đã đặt lúc {time} bởi {confirmedBy}
    </div>
  );
}
