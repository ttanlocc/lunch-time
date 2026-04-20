// client/src/components/QRModal.jsx

const BANK_CODE = import.meta.env.VITE_BANK_CODE || 'MB';
const BANK_ACCOUNT = import.meta.env.VITE_BANK_ACCOUNT || '123456789';
const ACCOUNT_NAME = import.meta.env.VITE_ACCOUNT_NAME || 'LUNCH TEAM';

function buildQRUrl(amount, content) {
  const base = `https://img.vietqr.io/image/${BANK_CODE}-${BANK_ACCOUNT}-compact2.png`;
  return `${base}?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
}

export function QRModal({ person, amount, week, onClose }) {
  const content = `Lunch Tuan ${week} ${person}`;
  const qrUrl = buildQRUrl(amount, content);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,20,50,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 20px 60px rgba(180,140,220,0.35)', width: 340, textAlign: 'center', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, fontSize: 20, cursor: 'pointer', color: '#ccc', background: 'none', border: 'none', lineHeight: 1 }}>✕</button>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{person}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 18 }}>Quét QR để chuyển khoản</div>
        <img src={qrUrl} alt="VietQR" style={{ width: 200, height: 200, borderRadius: 16, border: '3px solid #ede9fe', display: 'block', margin: '0 auto 16px', boxShadow: '0 4px 16px rgba(180,140,220,0.15)' }} />
        <div style={{ fontSize: 28, fontWeight: 800, color: '#ec4899', marginBottom: 6 }}>{(amount / 1000).toFixed(0)},000đ</div>
        <div style={{ display: 'inline-block', background: '#f5f0fb', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: 'monospace', color: '#7c6f8e', marginBottom: 16, fontWeight: 600 }}>{content}</div>
        <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5 }}>
          Mở app ngân hàng → quét QR<br />
          Số tiền & nội dung điền <strong style={{ color: '#a855f7' }}>tự động</strong><br />
          <strong style={{ color: '#a855f7' }}>SePay</strong> tự xác nhận sau khi nhận tiền
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 700, color: '#a855f7', marginTop: 12 }}>
          ⚡ Powered by SePay
        </div>
      </div>
    </div>
  );
}
