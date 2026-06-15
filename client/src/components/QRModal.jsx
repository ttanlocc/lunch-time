import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';

export function QRModal({ person, amount: amountProp, week, year, onClose, onPaid, paid: paidProp = false }) {
  const [qrData, setQrData] = useState(null);
  const [paidInternal, setPaidInternal] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const paid = paidProp || paidInternal;

  const currentYear = year || new Date().getFullYear();

  useEffect(() => {
    api.getPersonQr(person, week, currentYear).then(setQrData).catch(() => {});
  }, [person, week, currentYear]);

  const amount = qrData?.amount ?? amountProp ?? 0;
  const qrContent = qrData?.qrCode ?? (week ? `Lunch Tuan ${week} ${person}` : `Lunch ${person}`);
  const qrImageUrl = qrData?.qrImageUrl ?? `https://img.vietqr.io/image/MB-${import.meta.env.VITE_BANK_ACCOUNT ?? ''}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(qrContent)}`;

  useEffect(() => {
    if (!paid) return;
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); onClose?.(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paid]);

  useSSE({
    payment_confirmed: ({ person_name, week: w, all_weeks }) => {
      if (person_name !== person) return;
      const covers = week == null ? (w != null || !!all_weeks) : (w === week || !!all_weeks);
      if (covers) { setPaidInternal(true); onPaid?.(); }
    },
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,20,50,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 20px 60px rgba(180,140,220,0.35)', width: 340, textAlign: 'center', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, fontSize: 20, cursor: 'pointer', color: '#ccc', background: 'none', border: 'none', lineHeight: 1 }}>✕</button>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{person}</div>

        {paid ? (
          <div style={{ padding: '24px 0 8px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#059669', marginBottom: 6 }}>Đã thanh toán!</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>SePay đã xác nhận nhận tiền</div>
            {countdown !== null && (
              <div style={{ fontSize: 12, color: '#a0aec0' }}>Tự đóng sau {countdown}s</div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 18 }}>Quét QR để chuyển khoản</div>
            {!qrData ? (
              <div style={{ width: 200, height: 200, borderRadius: 16, border: '3px solid #ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#aaa', fontSize: 12 }}>Đang tải...</div>
            ) : (
              <img src={qrImageUrl} alt="VietQR" style={{ width: 200, height: 200, borderRadius: 16, border: '3px solid #ede9fe', display: 'block', margin: '0 auto 16px', boxShadow: '0 4px 16px rgba(180,140,220,0.15)' }} />
            )}
            <div style={{ fontSize: 28, fontWeight: 800, color: '#ec4899', marginBottom: 6 }}>{Math.round(amount).toLocaleString('en-US')}đ</div>
            <div style={{ display: 'inline-block', background: '#f5f0fb', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontFamily: 'monospace', color: '#7c6f8e', marginBottom: 16, fontWeight: 600 }}>{qrContent}</div>
            <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.5 }}>
              Mở app ngân hàng → quét QR<br />
              Số tiền & nội dung điền <strong style={{ color: '#a855f7' }}>tự động</strong><br />
              <strong style={{ color: '#a855f7' }}>SePay</strong> tự xác nhận sau khi nhận tiền
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'linear-gradient(135deg,#fce7f3,#ede9fe)', borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 700, color: '#a855f7', marginTop: 12 }}>
              ⚡ Powered by SePay
            </div>
          </>
        )}
      </div>
    </div>
  );
}
