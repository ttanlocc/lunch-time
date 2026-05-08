import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { QRModal } from '../components/QRModal.jsx';
import { ChevronLeft, ChevronRight, X, QrCode } from 'lucide-react';

function PaymentSuccessToast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      <style>{`@keyframes debtToastIn { from { opacity:0; transform:translateX(32px) scale(0.96); } to { opacity:1; transform:translateX(0) scale(1); } }`}</style>
      {toasts.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#d1fae5,#a7f3d0)', border: '1.5px solid #6ee7b7', borderRadius: 14, padding: '10px 16px', boxShadow: '0 6px 20px rgba(16,185,129,0.2)', animation: 'debtToastIn 0.28s cubic-bezier(0.175,0.885,0.32,1.275) both', minWidth: 220 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#6ee7b7,#10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, fontWeight: 900, flexShrink: 0 }}>✓</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46' }}>{t.person_name} đã thanh toán</div>
            <div style={{ fontSize: 11, color: '#059669' }}>SePay xác nhận thành công</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function useIsLandscape() {
  const [landscape, setLandscape] = useState(() => window.innerWidth > window.innerHeight);
  useEffect(() => {
    const handler = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return landscape;
}

const BANK_CODE = import.meta.env.VITE_BANK_CODE || 'MB';
const BANK_ACCOUNT = import.meta.env.VITE_BANK_ACCOUNT || '123456789';
const ACCOUNT_NAME = import.meta.env.VITE_ACCOUNT_NAME || 'LUNCH TEAM';

function buildQRUrl(amount, content) {
  const base = `https://img.vietqr.io/image/${BANK_CODE}-${BANK_ACCOUNT}-compact2.png`;
  return `${base}?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
}

function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.floor((d - startOfWeek1) / (7 * 86400000)) + 1;
}

function weeksInYear(y) {
  return getWeekNumber(new Date(y, 11, 28));
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function PaidBadge({ paidAt }) {
  const timeStr = paidAt
    ? new Date(paidAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', padding: '8px 0' }}>
      <style>{`
        @keyframes paidPopIn {
          0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
          60%  { transform: scale(1.15) rotate(4deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes paidRipple {
          0%   { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes paidFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'rgba(16,185,129,0.25)',
          animation: 'paidRipple 1.4s ease-out infinite',
        }} />
        <div style={{
          position: 'relative', width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg,#6ee7b7,#10b981)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(16,185,129,0.45)',
          animation: 'paidPopIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both',
          fontSize: 30, color: '#fff', fontWeight: 900,
        }}>✓</div>
      </div>

      <div style={{ animation: 'paidFadeUp 0.4s 0.2s ease both', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#059669', marginBottom: 4 }}>Đã thanh toán</div>
        {timeStr && <div style={{ fontSize: 11, color: '#9ca3af' }}>{timeStr}</div>}
      </div>
    </div>
  );
}

function DebtDetailModal({ debt, week, year, onClose, onPay, isAdmin, onOverride, onExcludeDay }) {
  const isPaid = debt.status === 'paid';
  const isLandscape = useIsLandscape();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleOverride(targetStatus) {
    setError('');
    setLoading(true);
    try {
      await api.overridePayment({ person_name: debt.person_name, week, year, status: targetStatus, password });
      onOverride(debt.person_name, targetStatus);
      setPassword('');
    } catch {
      setError('Sai mật khẩu hoặc lỗi server');
    } finally {
      setLoading(false);
    }
  }

  async function handleExcludeDay(date, excluded) {
    setError('');
    setLoading(true);
    try {
      await api.excludeDay({ person_name: debt.person_name, date, excluded, password });
      onExcludeDay(debt.person_name, date, excluded);
    } catch {
      setError('Sai mật khẩu hoặc lỗi server');
    } finally {
      setLoading(false);
    }
  }

  const qrContent = `Lunch Tuan ${week} ${debt.person_name}`;
  const qrUrl = buildQRUrl(debt.amount, qrContent);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 14px', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', background: isPaid ? 'linear-gradient(135deg,#6ee7b7,#10b981)' : 'linear-gradient(135deg,#f9a8d4,#c084fc)', flexShrink: 0 }}>
          {(debt.person_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{debt.person_name}</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>Tuần {week}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: isPaid ? '#059669' : '#ec4899' }}>
          {(debt.amount / 1000).toFixed(0)}k
        </span>
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
          <X size={16} />
        </button>
      </div>
    </div>
  );

  const orderBreakdown = (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
      {(debt.orders_by_date || []).map(day => (
        <div key={day.date} style={{ marginBottom: 14, opacity: day.excluded ? 0.45 : 1, transition: 'opacity 0.2s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: day.excluded ? '#9ca3af' : '#374151', textDecoration: day.excluded ? 'line-through' : 'none' }}>
                {formatDate(day.date)}
              </span>
              {day.excluded && <span style={{ fontSize: 10, background: '#fef3c7', color: '#d97706', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>đã trả riêng</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: day.excluded ? '#9ca3af' : '#a855f7', textDecoration: day.excluded ? 'line-through' : 'none' }}>
                {(day.subtotal / 1000).toFixed(0)}k
              </span>
              {isAdmin && (
                <button
                  onClick={() => handleExcludeDay(day.date, !day.excluded)}
                  disabled={loading || !password}
                  title={day.excluded ? 'Bỏ đánh dấu' : 'Đánh dấu đã trả riêng'}
                  style={{
                    width: 22, height: 22, borderRadius: 6, border: 'none', cursor: loading || !password ? 'default' : 'pointer',
                    background: day.excluded ? '#d1fae5' : '#f3f4f6',
                    color: day.excluded ? '#059669' : '#9ca3af',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800,
                    opacity: !password ? 0.4 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {day.excluded ? '✓' : '–'}
                </button>
              )}
            </div>
          </div>
          {day.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', paddingLeft: 12, marginBottom: 3 }}>
              <span style={{ flex: 1, marginRight: 8 }}>
                {item.item_name}
                {item.note && <span style={{ color: '#c084fc', fontSize: 12 }}> [{item.note}]</span>}
              </span>
              <span style={{ flexShrink: 0 }}>{(item.price / 1000).toFixed(0)}k</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const qrPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isLandscape ? '18px 22px 18px 0' : '0 28px 28px', gap: 12, ...(isLandscape ? { borderLeft: '1px solid #f3f4f6', width: 290, flexShrink: 0 } : {}) }}>
      {!isPaid ? (
        <>
          <img src={qrUrl} alt="VietQR" style={{ width: isLandscape ? 240 : 270, height: isLandscape ? 240 : 270, borderRadius: 14, border: '3px solid #ede9fe', display: 'block' }} />
          <button onClick={onPay} style={{ width: '100%', padding: '11px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ec4899,#a855f7)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 14px rgba(192,132,252,0.35)' }}>
            <QrCode size={14} />
            Toàn màn hình
          </button>
        </>
      ) : (
        <PaidBadge paidAt={debt.paid_at} />
      )}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,20,50,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)', padding: 20 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: isLandscape ? 920 : 620, boxShadow: '0 20px 60px rgba(180,140,220,0.3)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {header}
        <div style={{ display: 'flex', flexDirection: isLandscape ? 'row' : 'column', flex: 1, overflow: 'hidden' }}>
          {orderBreakdown}
          {qrPanel}
        </div>
        {isAdmin && (
          <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa' }}>
            <input
              type="password"
              placeholder="Mật khẩu admin để thao tác"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none' }}
            />
            {isPaid ? (
              <button
                onClick={() => handleOverride('pending')}
                disabled={loading || !password}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#fee2e2', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: loading || !password ? 0.5 : 1 }}
              >
                Hoàn tác
              </button>
            ) : (
              <button
                onClick={() => handleOverride('paid')}
                disabled={loading || !password}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#d1fae5', color: '#059669', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: loading || !password ? 0.5 : 1 }}
              >
                Đánh dấu đã trả
              </button>
            )}
            {error && <span style={{ fontSize: 12, color: '#dc2626' }}>{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function AccumulatedDebtModal({ debt, paid = false, onClose, isAdmin, onAllPaid }) {
  const isLandscape = useIsLandscape();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [qrFull, setQrFull] = useState(false);

  useEffect(() => {
    api.getPersonUnpaidDetail(debt.person_name).then(setDetail);
  }, [debt.person_name]);

  async function handleMarkAllPaid() {
    setError('');
    setLoading(true);
    try {
      await Promise.all(
        debt.unpaid_weeks.map(w =>
          api.overridePayment({ person_name: debt.person_name, week: w.week, year: w.year, status: 'paid', password })
        )
      );
      onAllPaid(debt.person_name);
      setPassword('');
    } catch {
      setError('Sai mật khẩu hoặc lỗi server');
    } finally {
      setLoading(false);
    }
  }

  const qrContent = `Lunch ${debt.person_name}`;
  const qrUrl = buildQRUrl(debt.total_amount, qrContent);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 14px', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#f9a8d4,#c084fc)', flexShrink: 0 }}>
          {(debt.person_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{debt.person_name}</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>Tổng nợ · {debt.unpaid_weeks.length} tuần</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#ec4899' }}>{(debt.total_amount / 1000).toFixed(0)}k</span>
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
          <X size={16} />
        </button>
      </div>
    </div>
  );

  const orderBreakdown = (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
      {!detail && <div style={{ color: '#bbb', fontSize: 13 }}>Đang tải...</div>}
      {detail?.orders_by_date.map(day => (
        <div key={day.date} style={{ marginBottom: 14, opacity: day.excluded ? 0.45 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: day.excluded ? '#9ca3af' : '#374151', textDecoration: day.excluded ? 'line-through' : 'none' }}>
              {formatDate(day.date)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: day.excluded ? '#9ca3af' : '#a855f7', textDecoration: day.excluded ? 'line-through' : 'none' }}>
              {(day.subtotal / 1000).toFixed(0)}k
            </span>
          </div>
          {day.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', paddingLeft: 12, marginBottom: 3 }}>
              <span style={{ flex: 1, marginRight: 8 }}>
                {item.item_name}
                {item.note && <span style={{ color: '#c084fc', fontSize: 12 }}> [{item.note}]</span>}
              </span>
              <span style={{ flexShrink: 0 }}>{(item.price / 1000).toFixed(0)}k</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const qrPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isLandscape ? '18px 22px 18px 0' : '0 28px 28px', gap: 12, ...(isLandscape ? { borderLeft: '1px solid #f3f4f6', width: 290, flexShrink: 0 } : {}) }}>
      {paid ? (
        <PaidBadge paidAt={null} />
      ) : (
        <>
          <img src={qrUrl} alt="VietQR" style={{ width: isLandscape ? 240 : 270, height: isLandscape ? 240 : 270, borderRadius: 14, border: '3px solid #ede9fe', display: 'block' }} />
          <button onClick={() => setQrFull(true)} style={{ width: '100%', padding: 11, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#ec4899,#a855f7)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 14px rgba(192,132,252,0.35)' }}>
            <QrCode size={14} />Toàn màn hình
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,20,50,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)', padding: 20 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: isLandscape ? 920 : 620, boxShadow: '0 20px 60px rgba(180,140,220,0.3)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {header}
          <div style={{ display: 'flex', flexDirection: isLandscape ? 'row' : 'column', flex: 1, overflow: 'hidden' }}>
            {orderBreakdown}
            {qrPanel}
          </div>
          {isAdmin && (
            <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa' }}>
              <input type="password" placeholder="Mật khẩu admin để thao tác" value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none' }} />
              <button onClick={handleMarkAllPaid} disabled={loading || !password}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#d1fae5', color: '#059669', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: loading || !password ? 0.5 : 1 }}>
                Đánh dấu đã trả
              </button>
              {error && <span style={{ fontSize: 12, color: '#dc2626' }}>{error}</span>}
            </div>
          )}
        </div>
      </div>
      {qrFull && <QRModal person={debt.person_name} amount={debt.total_amount} week={null} onClose={() => setQrFull(false)} />}
    </>
  );
}

function getPrevWeek() {
  const now = new Date();
  const w = getWeekNumber(now);
  if (w > 1) return { week: w - 1, year: now.getFullYear() };
  const prevYear = now.getFullYear() - 1;
  return { week: weeksInYear(prevYear), year: prevYear };
}

export function DebtPage({ isAdmin = false }) {
  const currentWeek = getWeekNumber();
  const currentYear = new Date().getFullYear();
  const defaultPeriod = isAdmin ? { week: currentWeek, year: currentYear } : getPrevWeek();
  const [tab, setTab] = useState('all');
  const [week, setWeek] = useState(defaultPeriod.week);
  const [year, setYear] = useState(defaultPeriod.year);
  const [data, setData] = useState({ debts: [] });
  const [accumulated, setAccumulated] = useState({ debts: [] });
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [selectedAccumulated, setSelectedAccumulated] = useState(null);
  const [accumulatedPaid, setAccumulatedPaid] = useState(false);
  const [qrPerson, setQrPerson] = useState(null);
  const [qrPaid, setQrPaid] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  function addPaymentToast(person_name) {
    const id = ++toastId.current;
    setToasts(ts => [...ts, { id, person_name }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4000);
  }

  useEffect(() => { api.getDebts(week, year).then(setData); }, [week, year]);
  useEffect(() => { api.getAccumulatedDebts().then(setAccumulated); }, []);

  function updateDebtStatus(person_name, status) {
    setData(d => ({ ...d, debts: d.debts.map(debt => debt.person_name === person_name ? { ...debt, status } : debt) }));
    setSelectedDebt(s => s?.person_name === person_name ? { ...s, status } : s);
  }

  function refreshDebts() {
    api.getDebts(week, year).then(d => {
      setData(d);
      setSelectedDebt(s => s ? d.debts.find(x => x.person_name === s.person_name) ?? null : null);
    });
  }

  useSSE({
    payment_confirmed: ({ person_name, week: w, year: y, all_weeks }) => {
      const isAllWeeks = !!all_weeks;

      if (isAllWeeks) {
        refreshDebts();
      } else if (w === week && y === year) {
        updateDebtStatus(person_name, 'paid');
      }
      api.getAccumulatedDebts().then(setAccumulated);

      // Mark full-screen QR as paid if open for this person
      setQrPerson(qp => {
        if (qp && qp.person === person_name) {
          const covers = qp.week == null ? (w != null || isAllWeeks) : (w === qp.week || isAllWeeks);
          if (covers) setQrPaid(true);
        }
        return qp;
      });

      // Mark accumulated modal as paid if open for this person
      setSelectedAccumulated(s => {
        if (s && s.person_name === person_name) setAccumulatedPaid(true);
        return s;
      });

      // Show toast
      addPaymentToast(person_name);
    },
    payment_updated: ({ person_name, week: w, year: y, status }) => {
      if (w === week && y === year) updateDebtStatus(person_name, status);
    },
    debt_updated: ({ week: w, year: y }) => {
      if (w === week && y === year) refreshDebts();
      api.getAccumulatedDebts().then(setAccumulated);
    },
  });

  function goBack() {
    if (week > 1) { setWeek(w => w - 1); }
    else { const y = year - 1; setYear(y); setWeek(weeksInYear(y)); }
  }

  const { week: maxWeek, year: maxYear } = isAdmin ? { week: Infinity, year: Infinity } : getPrevWeek();
  const atMaxWeek = !isAdmin && (year > maxYear || (year === maxYear && week >= maxWeek));

  function goForward() {
    if (atMaxWeek) return;
    const maxInYear = weeksInYear(year);
    if (week < maxInYear) { setWeek(w => w + 1); }
    else { setYear(y => y + 1); setWeek(1); }
  }

  const totalAmount = data.debts.reduce((s, d) => s + d.amount, 0);
  const paidAmount = data.debts.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0);
  const unpaidCount = data.debts.filter(d => d.status !== 'paid').length;
  const paidCount = data.debts.filter(d => d.status === 'paid').length;
  const totalCount = data.debts.length;
  const accumulatedCount = accumulated.debts.length;
  const accumulatedTotal = accumulated.debts.reduce((s, d) => s + d.total_amount, 0);
  const paidPct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PaymentSuccessToast toasts={toasts} />
      {/* Header */}
      <div style={{ padding: 'var(--header-pad)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: tab === 'week' && totalCount > 0 ? 10 : 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Công nợ</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>SePay tự xác nhận khi nhận đúng nội dung</div>
          </div>
          {tab === 'week' ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: unpaidCount > 0 ? '#ec4899' : '#059669' }}>
                {unpaidCount > 0 ? `Còn ${unpaidCount} người chưa trả` : 'Tất cả đã trả ✓'}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                {(paidAmount / 1000).toFixed(0)}k / {(totalAmount / 1000).toFixed(0)}k thu được
              </div>
            </div>
          ) : (
            <div style={{ background: accumulatedCount > 0 ? '#fef3c7' : '#d1fae5', color: accumulatedCount > 0 ? '#d97706' : '#059669', padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {accumulatedCount > 0 ? `${accumulatedCount} người · ${(accumulatedTotal / 1000).toFixed(0)}k` : 'Không có nợ cũ ✓'}
            </div>
          )}
        </div>
        {tab === 'week' && totalCount > 0 && (
          <div style={{ position: 'relative', height: 5, borderRadius: 999, background: '#f3e8ff', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${paidPct}%`, borderRadius: 999, background: 'linear-gradient(90deg,#a855f7,#ec4899)', transition: 'width 0.4s ease' }} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0', background: 'var(--color-card)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        {[{ key: 'all', label: 'Tổng' }, { key: 'week', label: 'Theo tuần' }].map(t => {
          const badge = t.key === 'all' && accumulatedCount > 0 ? accumulatedCount : t.key === 'week' && unpaidCount > 0 ? unpaidCount : null;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ padding: '7px 16px', borderRadius: '10px 10px 0 0', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: tab === t.key ? '#a855f7' : 'transparent', color: tab === t.key ? '#fff' : '#9ca3af', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}
            >
              {t.label}
              {badge !== null && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: tab === t.key ? 'rgba(255,255,255,0.3)' : (t.key === 'all' ? '#fbbf24' : '#f9a8d4'),
                  color: tab === t.key ? '#fff' : (t.key === 'all' ? '#92400e' : '#be185d'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--content-pad-v) var(--content-pad-h)' }}>
        {tab === 'week' ? (
          <>
            {/* Week selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button onClick={goBack} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
                <ChevronLeft size={16} />
              </button>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Tuần {week}</span>
                <span style={{ fontSize: 12, color: '#aaa', marginLeft: 3 }}> · {year}</span>
              </div>
              <button onClick={goForward} disabled={atMaxWeek} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: atMaxWeek ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: atMaxWeek ? '#d1d5db' : '#a855f7' }}>
                <ChevronRight size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {[...data.debts].sort((a, b) => {
                if (a.status !== b.status) return a.status === 'paid' ? 1 : -1;
                return b.amount - a.amount;
              }).map(d => {
                const isPaid = d.status === 'paid';
                return (
                  <button
                    key={d.person_name}
                    onClick={() => setSelectedDebt(d)}
                    style={{ background: '#fff', borderRadius: 12, padding: '12px 12px 10px', boxShadow: '0 2px 8px rgba(180,140,220,0.07)', border: '1.5px solid', borderColor: isPaid ? '#a7f3d0' : '#f9a8d4', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', textAlign: 'center', transition: 'box-shadow var(--transition-fast)' }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', background: isPaid ? 'linear-gradient(135deg,#6ee7b7,#10b981)' : 'linear-gradient(135deg,#f9a8d4,#c084fc)' }}>
                      {(d.person_name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{d.person_name}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: isPaid ? '#059669' : '#ec4899' }}>
                      {(d.amount / 1000).toFixed(0)}k
                    </div>
                    <span style={{ fontSize: 10, background: isPaid ? '#d1fae5' : '#fdf4ff', color: isPaid ? '#059669' : '#a855f7', borderRadius: 6, padding: '2px 8px', fontWeight: 600, border: `1px solid ${isPaid ? '#a7f3d0' : '#e9d5ff'}` }}>
                      {isPaid ? '✓ Đã trả' : `Tuần ${week} · ${(d.amount / 1000).toFixed(0)}k`}
                    </span>
                  </button>
                );
              })}
              {data.debts.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#bbb', fontSize: 13, marginTop: 40 }}>Chưa có đơn nào tuần này</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>
              Tổng nợ chưa thanh toán qua tất cả các tuần
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {[...accumulated.debts].sort((a, b) => b.total_amount - a.total_amount).map(d => {
                const isMultiWeek = d.unpaid_weeks.length > 1;
                return (
                <div
                  key={d.person_name}
                  onClick={() => { setAccumulatedPaid(false); setSelectedAccumulated(d); }}
                  style={{
                    background: '#fff', borderRadius: 12, padding: '12px 12px 10px',
                    boxShadow: isMultiWeek ? '0 3px 12px rgba(251,146,60,0.2)' : '0 2px 8px rgba(180,140,220,0.07)',
                    border: `1.5px solid ${isMultiWeek ? '#fed7aa' : '#f9a8d4'}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  {isMultiWeek && (
                    <span style={{ position: 'absolute', top: 7, right: 7, fontSize: 9, fontWeight: 800, background: '#fb923c', color: '#fff', borderRadius: 6, padding: '2px 5px', lineHeight: 1.3 }}>
                      {d.unpaid_weeks.length} tuần
                    </span>
                  )}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', background: isMultiWeek ? 'linear-gradient(135deg,#fb923c,#ef4444)' : 'linear-gradient(135deg,#f9a8d4,#c084fc)' }}>
                    {(d.person_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{d.person_name}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: isMultiWeek ? '#ea580c' : '#ec4899' }}>
                    {(d.total_amount / 1000).toFixed(0)}k
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                    {d.unpaid_weeks.map(w => (
                      <span
                        key={`${w.week}|${w.year}`}
                        style={{ fontSize: 10, background: isMultiWeek ? '#fff7ed' : '#fdf4ff', color: isMultiWeek ? '#c2410c' : '#a855f7', borderRadius: 6, padding: '2px 6px', fontWeight: 600, border: `1px solid ${isMultiWeek ? '#fed7aa' : '#e9d5ff'}` }}
                      >
                        T{w.week} · {(w.amount / 1000).toFixed(0)}k
                      </span>
                    ))}
                  </div>
                </div>
              );
              })}
              {accumulated.debts.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#bbb', fontSize: 13, marginTop: 40 }}>Không có ai nợ cả!</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail modal (bottom sheet) */}
      {selectedDebt && (
        <DebtDetailModal
          debt={selectedDebt}
          week={week}
          year={year}
          isAdmin={isAdmin}
          onClose={() => setSelectedDebt(null)}
          onPay={() => {
            setQrPaid(false);
            setQrPerson({ person: selectedDebt.person_name, amount: selectedDebt.amount, week });
            setSelectedDebt(null);
          }}
          onOverride={(person_name, status) => updateDebtStatus(person_name, status)}
          onExcludeDay={() => refreshDebts()}
        />
      )}

      {/* Full-screen QR */}
      {qrPerson && (
        <QRModal person={qrPerson.person} amount={qrPerson.amount} week={week} paid={qrPaid} onClose={() => setQrPerson(null)} />
      )}

      {selectedAccumulated && (
        <AccumulatedDebtModal
          debt={selectedAccumulated}
          paid={accumulatedPaid}
          isAdmin={isAdmin}
          onClose={() => setSelectedAccumulated(null)}
          onAllPaid={() => {
            setSelectedAccumulated(null);
            api.getAccumulatedDebts().then(setAccumulated);
          }}
        />
      )}
    </div>
  );
}
