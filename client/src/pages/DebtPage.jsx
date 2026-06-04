import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { QRModal } from '../components/QRModal.jsx';
import { X } from 'lucide-react';
import { HistoryPage } from './HistoryPage.jsx';

// ─── Design tokens (exact match to Payment Page.html) ────────────────────────
const C = {
  cream:       '#fbf7f3',
  paper:       '#ffffff',
  paperWarm:   '#fbf6f1',
  paperCool:   '#f9f4f0',
  ink:         '#2b2235',
  inkSoft:     '#6b5d75',
  inkMute:     '#a89aae',
  hl:          'rgba(43,34,53,0.07)',
  hlStrong:    'rgba(43,34,53,0.13)',
  magenta:     '#e8a8c4',
  magentaDeep: '#c47899',
  magentaInk:  '#a55c7d',
  violet:      '#b8a4d4',
  rose:        '#fbe7ee',
  emerald:     '#8fc1ab',
  emeraldDeep: '#5b9b7f',
  sage:        '#e0eee5',
  amber:       '#d4a373',
  amberSoft:   '#f6e8d6',
};

const MONO = "'JetBrains Mono', monospace";

// ─── Constants ────────────────────────────────────────────────────────────────
const BANK_CODE    = import.meta.env.VITE_BANK_CODE    || 'MB';
const BANK_ACCOUNT = import.meta.env.VITE_BANK_ACCOUNT || '123456789';
const ACCOUNT_NAME = import.meta.env.VITE_ACCOUNT_NAME || 'LUNCH TEAM';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.floor((d - startOfWeek1) / (7 * 86400000)) + 1;
}
function weeksInYear(y) { return getWeekNumber(new Date(y, 11, 28)); }
function getPrevWeek() {
  const now = new Date();
  const w = getWeekNumber(now);
  if (w > 1) return { week: w - 1, year: now.getFullYear() };
  const prevYear = now.getFullYear() - 1;
  return { week: weeksInYear(prevYear), year: prevYear };
}

const VN_DAYS = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
function getDayName(dateStr) { return VN_DAYS[new Date(dateStr).getDay()]; }
function getShortDate(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2,'0')} / ${String(d.getMonth()+1).padStart(2,'0')}`;
}

// Use en-US locale so thousands separator is comma (55,000) matching the design
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function fmtK(n) { return Math.round(n / 1000).toLocaleString('en-US'); }

function buildQRUrl(amount, content) {
  return `https://img.vietqr.io/image/${BANK_CODE}-${BANK_ACCOUNT}-qr_only.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
}

function slugName(name) {
  return name.replace(/[Đ]/g, 'D').replace(/[đ]/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Global CSS injected once
const GLOBAL_CSS = `
  @keyframes pulseDot {
    0%   { box-shadow: 0 0 0 0 rgba(31,122,91,0.5); }
    70%  { box-shadow: 0 0 0 8px rgba(31,122,91,0); }
    100% { box-shadow: 0 0 0 0 rgba(31,122,91,0); }
  }
  @keyframes pulseMag {
    0%   { box-shadow: 0 0 0 0 rgba(214,54,127,0.55); }
    70%  { box-shadow: 0 0 0 8px rgba(214,54,127,0); }
    100% { box-shadow: 0 0 0 0 rgba(214,54,127,0); }
  }
  @keyframes revealIn {
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .dt-reveal { opacity: 0; transform: translateY(8px); animation: revealIn 600ms cubic-bezier(.2,.8,.2,1) both; }
  .dt-r1 { animation-delay: 80ms; }
  .dt-r2 { animation-delay: 160ms; }
  .dt-r3 { animation-delay: 240ms; }
  .dt-r4 { animation-delay: 320ms; }
  .dt-pcard:hover { background: ${C.paperWarm} !important; }
  .dt-arrow:hover { background: ${C.ink} !important; color: ${C.paper} !important; border-color: ${C.ink} !important; }
  .dt-navitem:hover { background: rgba(26,15,29,0.04); color: ${C.ink}; }
  .dt-copy:hover { border-color: ${C.ink} !important; color: ${C.ink} !important; background: rgba(0,0,0,0.04) !important; }
  .dt-full:hover { background: ${C.magentaInk} !important; color: ${C.paper} !important; border-color: ${C.magentaInk} !important; }
  .dt-insp-scroll::-webkit-scrollbar { width: 3px; }
  .dt-insp-scroll::-webkit-scrollbar-track { background: transparent; }
  .dt-insp-scroll::-webkit-scrollbar-thumb { background: ${C.magenta}; border-radius: 2px; }
  .dt-main-scroll::-webkit-scrollbar { width: 4px; }
  .dt-main-scroll::-webkit-scrollbar-track { background: transparent; }
  .dt-main-scroll::-webkit-scrollbar-thumb { background: ${C.hlStrong}; border-radius: 2px; }
`;

// ─── Toast ────────────────────────────────────────────────────────────────────
function PaymentSuccessToast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:999, display:'flex', flexDirection:'column', gap:10, pointerEvents:'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background:C.paper, border:`1px solid ${C.hlStrong}`, borderRadius:6, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, minWidth:280, animation:'toastIn 380ms cubic-bezier(.2,.8,.2,1) both' }}>
          <div style={{ width:32, height:32, borderRadius:'50%', background:C.sage, color:C.emeraldDeep, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, flexShrink:0 }}>✓</div>
          <div>
            <strong style={{ fontSize:13, fontWeight:700, color:C.ink, display:'block' }}>{t.person_name} vừa thanh toán</strong>
            <span style={{ fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', color:C.inkMute }}>SePay xác nhận thành công</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Inspector: empty state ───────────────────────────────────────────────────
function InspectorEmpty() {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, color:C.inkMute }}>
      <div style={{ fontSize:28, opacity:0.25 }}>←</div>
      <div style={{ fontSize:13 }}>Chọn một người để xem phiếu</div>
    </div>
  );
}

// ─── Inspector: person panel ──────────────────────────────────────────────────
function InspectorPanel({ debt, week, year, isAdmin, onFullScreen, onOverride, onExcludeDay }) {
  const [qrData, setQrData]       = useState(null);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [qrErr, setQrErr]         = useState(false);

  const isPaid     = debt.status === 'paid';
  const qrContent  = qrData?.qrCode     ?? `Lunch Tuan ${week} ${slugName(debt.person_name)}`;
  const amount     = qrData?.amount     ?? debt.amount;
  const qrImageUrl = qrData?.qrImageUrl ?? buildQRUrl(amount, qrContent);

  const orders     = debt.orders_by_date || [];
  const dayCount   = orders.filter(d => !d.excluded).length;
  const itemCount  = orders.reduce((s, d) => s + (d.excluded ? 0 : d.items.length), 0);
  const noteCount  = orders.reduce((s, d) => s + d.items.filter(i => i.note).length, 0);

  const nameParts  = debt.person_name.trim().split(' ').filter(Boolean);
  const lastName   = nameParts.pop() ?? '';
  const firstName  = nameParts.join(' ');
  const nameSuffix = lastName.substring(0, 2).toUpperCase();
  const docNum     = `LT-${week}-${nameSuffix}`;

  useEffect(() => {
    setQrData(null); setQrErr(false); setPassword(''); setError('');
    api.getPersonQr(debt.person_name).then(setQrData).catch(() => {});
  }, [debt.person_name, week, year]);

  function copy() {
    try { navigator.clipboard?.writeText(qrContent); } catch {}
    setCopyLabel('Đã copy');
    setTimeout(() => setCopyLabel('Copy'), 1500);
  }

  async function handleOverride(targetStatus) {
    setError(''); setLoading(true);
    try {
      await api.overridePayment({ person_name: debt.person_name, week, year, status: targetStatus, password });
      onOverride(debt.person_name, targetStatus);
      setPassword('');
    } catch { setError('Sai mật khẩu hoặc lỗi server'); }
    finally { setLoading(false); }
  }

  async function handleExcludeDay(date, excluded) {
    setError(''); setLoading(true);
    try {
      await api.excludeDay({ person_name: debt.person_name, date, excluded, password });
      onExcludeDay();
    } catch { setError('Sai mật khẩu hoặc lỗi server'); }
    finally { setLoading(false); }
  }

  const corner = (pos) => {
    const b = { position:'absolute', width:12, height:12, border:`1px solid ${C.ink}` };
    if (pos==='tl') return { ...b, top:-1, left:-1, borderRight:'none', borderBottom:'none' };
    if (pos==='tr') return { ...b, top:-1, right:-1, borderLeft:'none', borderBottom:'none' };
    if (pos==='bl') return { ...b, bottom:-1, left:-1, borderRight:'none', borderTop:'none' };
    return { ...b, bottom:-1, right:-1, borderLeft:'none', borderTop:'none' };
  };

  return (
    <>
      {/* insp-head */}
      <div style={{ padding:'22px 26px 18px', borderBottom:`1px solid ${C.hl}`, display:'flex', flexDirection:'column', gap:10, flexShrink:0 }}>
        {/* eyebrow */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:C.inkMute, fontWeight:600 }}>
          <span>Phiếu thanh toán · Tuần {week}</span>
          <span style={{ fontFamily:MONO, letterSpacing:'0.08em', color:C.inkSoft }}>{docNum}</span>
        </div>
        {/* person */}
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:52, height:52, borderRadius:'50%', background:C.rose, color:C.magentaInk, fontWeight:700, fontSize:26, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {(debt.person_name?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontFamily:"'Be Vietnam Pro', sans-serif", fontWeight:600, fontSize:20, lineHeight:1.15, letterSpacing:'-0.01em', margin:0 }}>
              {firstName} <em style={{ fontStyle:'normal', color:C.magentaInk }}>{lastName}</em>
            </h2>
            <div style={{ fontSize:11, color:C.inkMute, marginTop:5, display:'flex', alignItems:'center', gap:6 }}>
              <span>{dayCount} ngày</span>
              <span style={{ width:3, height:3, borderRadius:'50%', background:C.inkMute, opacity:0.5, display:'inline-block', flexShrink:0 }} />
              <span>{itemCount} món</span>
              {noteCount > 0 && <>
                <span style={{ width:3, height:3, borderRadius:'50%', background:C.inkMute, opacity:0.5, display:'inline-block', flexShrink:0 }} />
                <span>{noteCount} ghi chú</span>
              </>}
            </div>
          </div>
        </div>
        {/* status pill */}
        {isPaid ? (
          <span style={{ alignSelf:'flex-start', fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', padding:'6px 12px', borderRadius:999, border:`1px solid rgba(91,155,127,0.3)`, lineHeight:1, fontWeight:600, display:'inline-flex', alignItems:'center', gap:7, color:C.emeraldDeep, background:C.sage }}>
            ✓ Đã thanh toán
          </span>
        ) : (
          <span style={{ alignSelf:'flex-start', fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', padding:'6px 12px', borderRadius:999, border:`1px solid rgba(214,54,127,0.3)`, lineHeight:1, fontWeight:600, display:'inline-flex', alignItems:'center', gap:7, color:C.magentaDeep, background:C.rose }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:C.magenta, display:'inline-block', animation:'pulseMag 1.6s ease-out infinite', flexShrink:0 }} />
            Đang chờ thanh toán
          </span>
        )}
      </div>

      {/* insp-body — scrollable order breakdown */}
      <div className="dt-insp-scroll" style={{ padding:'18px 26px', flex:'1 1 auto', overflowY:'auto', minHeight:0 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {orders.map(day => (
            <div key={day.date} style={{ display:'flex', flexDirection:'column', gap:4, opacity: day.excluded ? 0.45 : 1 }}>
              {/* day row */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', borderBottom:`1px dotted ${C.hlStrong}`, paddingBottom:4 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
                  <span style={{ fontWeight:600, fontSize:13, lineHeight:1, color: day.excluded ? C.inkMute : C.ink, textDecoration: day.excluded ? 'line-through' : 'none' }}>
                    {getDayName(day.date)}
                  </span>
                  <span style={{ fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:C.inkMute }}>
                    {getShortDate(day.date)}
                  </span>
                  {day.excluded && (
                    <span style={{ fontSize:9, background:C.amberSoft, color:C.amber, borderRadius:4, padding:'1px 6px', fontWeight:700 }}>đã trả riêng</span>
                  )}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:13, color: day.excluded ? C.inkMute : C.ink, fontWeight:500, textDecoration: day.excluded ? 'line-through' : 'none' }}>
                    {fmt(day.subtotal)}₫
                  </span>
                  {isAdmin && (
                    <button onClick={() => handleExcludeDay(day.date, !day.excluded)} disabled={loading || !password}
                      style={{ width:20, height:20, borderRadius:4, border:'none', cursor: loading||!password ? 'default' : 'pointer', background: day.excluded ? C.sage : `rgba(43,34,53,0.06)`, color: day.excluded ? C.emeraldDeep : C.inkMute, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, opacity: !password ? 0.35 : 1 }}>
                      {day.excluded ? '✓' : '–'}
                    </button>
                  )}
                </div>
              </div>
              {/* items */}
              <div style={{ display:'flex', flexDirection:'column', gap:2, paddingLeft:4 }}>
                {day.items.map((item, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'baseline', fontSize:12, color:C.inkSoft }}>
                    <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'55%' }}>{item.item_name}</span>
                    {item.note && <span style={{ color:C.violet, fontSize:11, marginLeft:4, whiteSpace:'nowrap' }}>[{item.note}]</span>}
                    <span style={{ flex:1, minWidth:16, borderBottom:`1px dotted ${C.hl}`, transform:'translateY(-3px)', margin:'0 6px' }} />
                    <span style={{ flexShrink:0, fontWeight:500, color:C.ink }}>{fmt(item.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* qr-card */}
      {!isPaid && (
        <div style={{ margin:'18px 26px', background:C.paper, border:`1px solid ${C.hlStrong}`, borderRadius:6, padding:'18px 18px 14px', position:'relative', flexShrink:0 }}>
          <span style={corner('tl')} /><span style={corner('tr')} />
          <span style={corner('bl')} /><span style={corner('br')} />
          {/* qr-frame */}
          <div style={{ aspectRatio:'1/1', position:'relative', background:'white', overflow:'hidden', marginBottom:12 }}>
            {!qrData ? (
              <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:C.inkMute, fontSize:12, padding:14 }}>Đang tải QR...</div>
            ) : qrErr ? (
              <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:C.inkMute, fontSize:12 }}>Không tải được QR</div>
            ) : (
              <img src={qrImageUrl} alt="VietQR" onError={() => setQrErr(true)}
                style={{ position:'relative', zIndex:1, width:'100%', height:'100%', background:'white', padding:14, objectFit:'contain' }} />
            )}
          </div>
          {/* bank-rows */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, padding:'8px 0', borderBottom:`1px dashed ${C.hl}` }}>
            <span style={{ fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:C.inkMute }}>MB Bank</span>
            <span style={{ fontSize:12, color:C.ink, fontWeight:600 }}>{ACCOUNT_NAME}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, padding:'8px 0', borderBottom:`1px dashed ${C.hl}` }}>
            <span style={{ fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:C.inkMute }}>Số tài khoản</span>
            <span style={{ fontSize:12, color:C.ink, fontWeight:500, fontFamily:MONO, letterSpacing:'0.04em' }}>{BANK_ACCOUNT}</span>
          </div>
          {/* ref */}
          <div style={{ background:C.paperWarm, border:`1px solid ${C.hl}`, padding:'8px 10px', borderRadius:2, marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:2, minWidth:0 }}>
              <span style={{ fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:C.inkMute }}>Nội dung</span>
              <span style={{ fontFamily:MONO, fontSize:11.5, color:C.ink, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{qrContent}</span>
            </div>
            <button className="dt-copy" onClick={copy} style={{ background:'transparent', border:`1px solid ${C.hlStrong}`, color:C.inkSoft, fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', fontWeight:600, padding:'5px 8px', borderRadius:2, cursor:'pointer', flexShrink:0, fontFamily:'inherit', transition:'all 150ms ease' }}>
              {copyLabel}
            </button>
          </div>
        </div>
      )}

      {/* pay-strip */}
      {!isPaid && (
        <div style={{ margin:'0 26px 18px', padding:'16px 18px', background:C.rose, color:C.magentaInk, border:`1px solid rgba(196,120,153,0.25)`, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, flexShrink:0 }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:C.magentaDeep, fontWeight:600, opacity:0.75 }}>Số tiền cần trả</div>
            <div style={{ fontFamily:"'Be Vietnam Pro', sans-serif", fontWeight:700, fontSize:28, lineHeight:1, marginTop:4, letterSpacing:'-0.02em', color:C.magentaInk }}>
              <span style={{ fontSize:14, color:C.magentaDeep, opacity:0.65, marginRight:4, fontWeight:500, verticalAlign:'6px' }}>₫</span>
              {fmt(amount)}
            </div>
          </div>
          <button className="dt-full" onClick={onFullScreen} style={{ background:C.paper, color:C.magentaInk, border:`1px solid rgba(196,120,153,0.3)`, borderRadius:999, padding:'9px 16px', cursor:'pointer', fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', fontWeight:700, display:'inline-flex', alignItems:'center', gap:7, fontFamily:'inherit', transition:'all 150ms ease' }}>
            Toàn màn hình <span style={{ fontSize:13 }}>↗</span>
          </button>
        </div>
      )}

      {/* paid state */}
      {isPaid && (
        <div style={{ margin:'0 26px 18px', padding:'20px 18px', background:C.sage, border:`1px solid rgba(91,155,127,0.25)`, borderRadius:6, display:'flex', flexDirection:'column', alignItems:'center', gap:8, flexShrink:0 }}>
          <div style={{ fontWeight:800, fontSize:24, color:C.emeraldDeep }}>✓</div>
          <div style={{ fontWeight:600, fontSize:14, color:C.emeraldDeep }}>Đã thanh toán</div>
          {debt.paid_at && <div style={{ fontSize:11, color:C.inkMute }}>{new Date(debt.paid_at).toLocaleString('vi-VN')}</div>}
        </div>
      )}

      {/* admin controls */}
      {isAdmin && (
        <div style={{ borderTop:`1px solid ${C.hl}`, padding:'14px 26px', display:'flex', flexDirection:'column', gap:8, flexShrink:0, background:C.paperCool }}>
          <input type="password" placeholder="Mật khẩu admin để thao tác" value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            style={{ width:'100%', padding:'8px 12px', borderRadius:4, border:`1px solid ${C.hlStrong}`, fontSize:12, background:C.paper, color:C.ink, outline:'none', fontFamily:'inherit' }} />
          <div style={{ display:'flex', gap:8 }}>
            {isPaid ? (
              <button onClick={() => handleOverride('pending')} disabled={loading || !password}
                style={{ flex:1, padding:8, borderRadius:4, border:'none', background:'#fee2e2', color:'#dc2626', fontSize:12, fontWeight:600, cursor:'pointer', opacity: loading||!password ? 0.5:1, fontFamily:'inherit' }}>
                Hoàn tác
              </button>
            ) : (
              <button onClick={() => handleOverride('paid')} disabled={loading || !password}
                style={{ flex:1, padding:8, borderRadius:4, border:'none', background:C.sage, color:C.emeraldDeep, fontSize:12, fontWeight:600, cursor:'pointer', opacity: loading||!password ? 0.5:1, fontFamily:'inherit' }}>
                Đánh dấu đã trả
              </button>
            )}
          </div>
          {error && <span style={{ fontSize:11, color:'#dc2626' }}>{error}</span>}
        </div>
      )}
    </>
  );
}

// ─── Accumulated debt modal (Tổng tab) ────────────────────────────────────────
function AccumulatedDebtModal({ debt, onClose, isAdmin, onAllPaid }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [detail, setDetail]     = useState(null);
  const [qrFull, setQrFull]     = useState(false);

  useEffect(() => { api.getPersonUnpaidDetail(debt.person_name).then(setDetail); }, [debt.person_name]);

  const qrContent  = `Lunch ${slugName(debt.person_name)}`;
  // Derive total/day-count from the freshly-fetched detail (same payload as the
  // line items) so the figure can't drift from the cached accumulated value.
  const amount     = detail?.total_amount ?? debt.total_amount;
  const dayCount   = detail?.orders_by_date
    ? detail.orders_by_date.filter(d => !d.excluded).length
    : debt.unpaid_days.length;
  const qrImageUrl = buildQRUrl(amount, qrContent);

  async function handleMarkAllPaid() {
    setError(''); setLoading(true);
    try {
      await api.overridePayment({ person_name: debt.person_name, status: 'paid', password });
      onAllPaid(debt.person_name);
      setPassword('');
    } catch { setError('Sai mật khẩu hoặc lỗi server'); }
    finally { setLoading(false); }
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(43,34,53,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, backdropFilter:'blur(4px)', padding:20 }}>
        <div onClick={e => e.stopPropagation()} style={{ background:C.paper, borderRadius:8, width:'100%', maxWidth:520, maxHeight:'88vh', display:'flex', flexDirection:'column', overflow:'hidden', border:`1px solid ${C.hlStrong}` }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 22px', borderBottom:`1px solid ${C.hl}`, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:C.amberSoft, color:C.amber, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700 }}>
                {(debt.person_name?.[0] ?? '?').toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:600, color:C.ink }}>{debt.person_name}</div>
                <div style={{ fontSize:11, color:C.inkMute }}>Tổng nợ · {dayCount} ngày</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:18, fontWeight:700, color:C.amber }}>{fmt(amount)}₫</span>
              <button onClick={onClose} style={{ width:28, height:28, borderRadius:'50%', background:C.paperWarm, border:`1px solid ${C.hl}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:C.inkMute }}>
                <X size={14} />
              </button>
            </div>
          </div>
          <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
            <div style={{ flex:1, overflowY:'auto', padding:'16px 22px' }}>
              {!detail && <div style={{ color:C.inkMute, fontSize:13 }}>Đang tải...</div>}
              {detail?.orders_by_date.map(day => (
                <div key={day.date} style={{ marginBottom:14, opacity: day.excluded ? 0.45 : 1 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:13, fontWeight:600, color: day.excluded ? C.inkMute : C.ink, textDecoration: day.excluded ? 'line-through' : 'none' }}>
                      {getDayName(day.date)} {getShortDate(day.date)}
                    </span>
                    <span style={{ fontSize:13, fontWeight:600, color: day.excluded ? C.inkMute : C.inkSoft, textDecoration: day.excluded ? 'line-through' : 'none' }}>
                      {fmt(day.subtotal)}₫
                    </span>
                  </div>
                  {day.items.map((item, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:C.inkSoft, paddingLeft:12, marginBottom:3 }}>
                      <span style={{ flex:1, marginRight:8 }}>
                        {item.item_name}
                        {item.note && <span style={{ color:C.violet, fontSize:11 }}> [{item.note}]</span>}
                      </span>
                      <span style={{ flexShrink:0 }}>{fmt(item.price)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ width:210, flexShrink:0, borderLeft:`1px solid ${C.hl}`, padding:'18px 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:10, background:C.paperWarm }}>
              <img src={qrImageUrl} alt="VietQR" style={{ width:174, height:174, border:`1px solid ${C.hlStrong}`, borderRadius:4, display:'block' }} />
              <div style={{ fontSize:13, fontWeight:600, color:C.ink, textAlign:'center' }}>{fmt(amount)}₫</div>
              <button onClick={() => setQrFull(true)} style={{ width:'100%', padding:'8px', borderRadius:4, border:`1px solid ${C.hlStrong}`, background:C.paper, color:C.ink, fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Toàn màn hình ↗
              </button>
            </div>
          </div>
          {isAdmin && (
            <div style={{ borderTop:`1px solid ${C.hl}`, padding:'12px 22px', display:'flex', alignItems:'center', gap:8, background:C.paperCool, flexShrink:0 }}>
              <input type="password" placeholder="Mật khẩu admin" value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                style={{ flex:1, padding:'8px 10px', borderRadius:4, border:`1px solid ${C.hlStrong}`, fontSize:12, outline:'none', fontFamily:'inherit', background:C.paper, color:C.ink }} />
              <button onClick={handleMarkAllPaid} disabled={loading || !password}
                style={{ padding:'8px 14px', borderRadius:4, border:'none', background:C.sage, color:C.emeraldDeep, fontSize:12, fontWeight:600, cursor:'pointer', opacity: loading||!password ? 0.5:1, whiteSpace:'nowrap', fontFamily:'inherit' }}>
                Đánh dấu đã trả
              </button>
              {error && <span style={{ fontSize:11, color:'#dc2626' }}>{error}</span>}
            </div>
          )}
        </div>
      </div>
      {qrFull && <QRModal person={debt.person_name} amount={amount} week={null} onClose={() => setQrFull(false)} />}
    </>
  );
}

// ─── Accumulated Debt Inspector ───────────────────────────────────────────────
function AccInspectorPanel({ debt, isAdmin, onFullScreen, onAllPaid }) {
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [qrErr, setQrErr]         = useState(false);
  const [detail, setDetail]       = useState(null);

  const qrContent  = `Lunch ${slugName(debt.person_name)}`;

  const nameParts = debt.person_name.trim().split(' ').filter(Boolean);
  const lastName  = nameParts.pop() ?? '';
  const firstName = nameParts.join(' ');

  // Single source of truth: the per-day breakdown below is rendered from
  // `detail` (/unpaid-detail). Derive the headline total + QR amount from that
  // SAME payload so "Tổng" always equals the sum of the rows shown. Fall back
  // to the cached accumulated value only while detail is still loading.
  const detailDays = detail?.orders_by_date ?? null;
  const amount     = detail?.total_amount ?? debt.total_amount;
  const dayCount   = detailDays
    ? detailDays.filter(d => !d.excluded).length
    : (debt.unpaid_days?.length ?? 0);
  const qrImageUrl = buildQRUrl(amount, qrContent);

  useEffect(() => {
    setQrErr(false); setPassword(''); setError(''); setDetail(null);
    api.getPersonUnpaidDetail(debt.person_name).then(setDetail).catch(() => setDetail({}));
  }, [debt.person_name]);

  function copy() {
    try { navigator.clipboard?.writeText(qrContent); } catch {}
    setCopyLabel('Đã copy');
    setTimeout(() => setCopyLabel('Copy'), 1500);
  }

  async function handleMarkAllPaid() {
    setError(''); setLoading(true);
    try {
      await api.overridePayment({ person_name: debt.person_name, status: 'paid', password });
      onAllPaid(debt.person_name);
      setPassword('');
    } catch { setError('Sai mật khẩu hoặc lỗi server'); }
    finally { setLoading(false); }
  }

  const corner = (pos) => {
    const b = { position:'absolute', width:12, height:12, border:`1px solid ${C.ink}` };
    if (pos==='tl') return { ...b, top:-1, left:-1, borderRight:'none', borderBottom:'none' };
    if (pos==='tr') return { ...b, top:-1, right:-1, borderLeft:'none', borderBottom:'none' };
    if (pos==='bl') return { ...b, bottom:-1, left:-1, borderRight:'none', borderTop:'none' };
    return { ...b, bottom:-1, right:-1, borderLeft:'none', borderTop:'none' };
  };

  return (
    <>
      {/* head */}
      <div style={{ padding:'22px 26px 18px', borderBottom:`1px solid ${C.hl}`, display:'flex', flexDirection:'column', gap:10, flexShrink:0 }}>
        <div style={{ fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:C.inkMute, fontWeight:600 }}>
          Phiếu thanh toán · Tổng dư nợ
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:52, height:52, borderRadius:'50%', background:C.rose, color:C.magentaInk, fontWeight:700, fontSize:26, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {(debt.person_name?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontFamily:"'Be Vietnam Pro', sans-serif", fontWeight:600, fontSize:20, lineHeight:1.15, letterSpacing:'-0.01em', margin:0 }}>
              {firstName} <em style={{ fontStyle:'normal', color:C.magentaInk }}>{lastName}</em>
            </h2>
            <div style={{ fontSize:11, color:C.inkMute, marginTop:5 }}>
              {dayCount} ngày chưa thanh toán
            </div>
          </div>
        </div>
        <span style={{ alignSelf:'flex-start', fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', padding:'6px 12px', borderRadius:999, border:`1px solid rgba(214,54,127,0.3)`, fontWeight:600, display:'inline-flex', alignItems:'center', gap:7, color:C.magentaDeep, background:C.rose }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:C.magenta, display:'inline-block', animation:'pulseMag 1.6s ease-out infinite', flexShrink:0 }} />
          Đang chờ thanh toán
        </span>
      </div>

      {/* scrollable body — chỉ lịch sử ăn scroll, QR cố định bên dưới */}
      <div className="dt-insp-scroll" style={{ flex:'1 1 auto', overflowY:'auto', minHeight:0 }}>
        {!detail && <div style={{ padding:'24px 26px', color:C.inkMute, fontSize:13 }}>Đang tải...</div>}
        {detail && (detail.orders_by_date ?? []).length > 0 && (
          <div style={{ padding:'16px 26px', display:'flex', flexDirection:'column', gap:14 }}>
            {(detail.orders_by_date ?? []).map(day => (
              <div key={day.date} style={{ opacity: day.excluded ? 0.45 : 1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, borderBottom:`1px dotted ${C.hlStrong}`, paddingBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:600, color: day.excluded ? C.inkMute : C.ink, textDecoration: day.excluded ? 'line-through' : 'none' }}>
                    {getDayName(day.date)}
                    <span style={{ fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:C.inkMute, marginLeft:8 }}>· {getShortDate(day.date)}</span>
                  </span>
                  <span style={{ fontSize:13, fontWeight:600, color: day.excluded ? C.inkMute : C.inkSoft, fontFamily:MONO, textDecoration: day.excluded ? 'line-through' : 'none' }}>
                    {fmt(day.subtotal)}₫
                  </span>
                </div>
                {day.items.map((item, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:C.inkSoft, paddingLeft:8, marginBottom:2 }}>
                    <span style={{ flex:1, marginRight:8 }}>
                      {item.item_name}
                      {item.note && <span style={{ color:C.violet, fontSize:11 }}> [{item.note}]</span>}
                    </span>
                    <span style={{ flexShrink:0, fontFamily:MONO }}>{fmt(item.price)}</span>
                  </div>
                ))}
              </div>
            ))}
            {dayCount > 1 && (
              <div style={{ display:'flex', justifyContent:'space-between', paddingTop:8, borderTop:`1px solid ${C.hl}`, fontSize:13, fontWeight:700, color:C.magentaInk }}>
                <span>Tổng</span>
                <span style={{ fontFamily:MONO }}>{fmt(amount)}₫</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* QR card — 2 cột, cố định không scroll */}
      <div style={{ margin:'12px 26px', background:C.paper, border:`1px solid ${C.hlStrong}`, borderRadius:6, padding:'14px', position:'relative', flexShrink:0 }}>
        <span style={corner('tl')} /><span style={corner('tr')} />
        <span style={corner('bl')} /><span style={corner('br')} />
        <div style={{ display:'flex', gap:14, alignItems:'center' }}>

          {/* Cột trái: QR */}
          <div style={{ flexShrink:0, width:128, height:128, borderRadius:4, overflow:'hidden', background:'white', border:`1px solid ${C.hl}` }}>
            {qrErr ? (
              <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:C.inkMute, fontSize:10, textAlign:'center', padding:8 }}>Không tải được QR</div>
            ) : !qrImageUrl ? (
              <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:C.inkMute, fontSize:10 }}>Đang tải...</div>
            ) : (
              <img src={qrImageUrl} alt="VietQR" onError={() => setQrErr(true)}
                style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }} />
            )}
          </div>

          {/* Cột phải: thông tin */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8, minWidth:0 }}>
            <div>
              <div style={{ fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:C.inkMute, fontWeight:600 }}>Ngân hàng</div>
              <div style={{ fontSize:13, fontWeight:600, color:C.ink, marginTop:2 }}>{BANK_CODE} · {ACCOUNT_NAME}</div>
            </div>
            <div>
              <div style={{ fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:C.inkMute, fontWeight:600 }}>Số tài khoản</div>
              <div style={{ fontSize:12, fontWeight:500, color:C.ink, fontFamily:MONO, letterSpacing:'0.04em', marginTop:2 }}>{BANK_ACCOUNT}</div>
            </div>
            <div style={{ background:C.paperWarm, border:`1px solid ${C.hl}`, borderRadius:4, padding:'6px 8px' }}>
              <div style={{ fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', color:C.inkMute, fontWeight:600 }}>Nội dung</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                <span style={{ fontFamily:MONO, fontSize:10.5, color:C.ink, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{qrContent}</span>
                <button className="dt-copy" onClick={copy}
                  style={{ flexShrink:0, background:'transparent', border:`1px solid ${C.hlStrong}`, color:C.inkSoft, fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', fontWeight:600, padding:'3px 7px', borderRadius:2, cursor:'pointer', fontFamily:'inherit', transition:'all 150ms ease' }}>
                  {copyLabel}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* pay strip */}
      <div style={{ borderTop:`1px solid ${C.hl}`, margin:0, padding:'16px 26px', background:C.rose, display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, flexShrink:0 }}>
        <div>
          <div style={{ fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:C.magentaDeep, fontWeight:600, opacity:0.75 }}>Số tiền cần trả</div>
          <div style={{ fontWeight:700, fontSize:26, lineHeight:1, marginTop:4, letterSpacing:'-0.02em', color:C.magentaInk }}>
            <span style={{ fontSize:13, opacity:0.65, marginRight:3, fontWeight:500, verticalAlign:'5px' }}>₫</span>
            {fmt(amount)}
          </div>
        </div>
        <button className="dt-full" onClick={onFullScreen} style={{ background:C.paper, color:C.magentaInk, border:`1px solid rgba(196,120,153,0.3)`, borderRadius:999, padding:'9px 16px', cursor:'pointer', fontSize:10, letterSpacing:'0.18em', textTransform:'uppercase', fontWeight:700, display:'inline-flex', alignItems:'center', gap:7, fontFamily:'inherit' }}>
          Toàn màn hình <span style={{ fontSize:13 }}>↗</span>
        </button>
      </div>

      {/* admin */}
      {isAdmin && (
        <div style={{ borderTop:`1px solid ${C.hl}`, padding:'14px 26px', display:'flex', flexDirection:'column', gap:8, flexShrink:0, background:C.paperCool }}>
          <input type="password" placeholder="Mật khẩu admin" value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            style={{ width:'100%', padding:'8px 12px', borderRadius:4, border:`1px solid ${C.hlStrong}`, fontSize:12, background:C.paper, color:C.ink, outline:'none', fontFamily:'inherit' }} />
          <button onClick={handleMarkAllPaid} disabled={loading || !password}
            style={{ padding:8, borderRadius:4, border:'none', background:C.sage, color:C.emeraldDeep, fontSize:12, fontWeight:600, cursor:'pointer', opacity: loading||!password ? 0.5:1, fontFamily:'inherit' }}>
            Đánh dấu tất cả đã trả
          </button>
          {error && <span style={{ fontSize:11, color:'#dc2626' }}>{error}</span>}
        </div>
      )}
    </>
  );
}

// ─── Paid ticket helpers + card ───────────────────────────────────────────────
function methodBadge(method) {
  switch (method) {
    case 'qr_code':    return { label: '⚡ Tự động · QR',  bg: C.sage,      fg: C.emeraldDeep };
    case 'fuzzy_name': return { label: '⚡ Tự động · Tên', bg: C.sage,      fg: C.emeraldDeep };
    default:           return { label: '✋ Thủ công',      bg: C.amberSoft, fg: C.amber };
  }
}

function PaidTicketCard({ ticket }) {
  const badge = methodBadge(ticket.match_method);
  const paidAt = ticket.paid_at ? new Date(ticket.paid_at) : null;
  const paidLabel = paidAt
    ? paidAt.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={{ background:C.paper, border:`1px solid ${C.hlStrong}`, borderRadius:6, padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
      {/* head */}
      <div style={{ display:'grid', gridTemplateColumns:'40px 1fr auto', alignItems:'center', gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:'50%', background:C.sage, color:C.emeraldDeep, fontWeight:600, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {(ticket.person_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:4, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:14, fontWeight:600, color:C.ink }}>{ticket.person_name}</span>
            <span style={{ fontSize:9, letterSpacing:'0.18em', textTransform:'uppercase', fontWeight:700, color:C.emeraldDeep, background:C.sage, border:`1px solid ${C.emeraldDeep}`, borderRadius:4, padding:'2px 8px' }}>
              ✓ Closed
            </span>
            <span style={{ fontSize:9, letterSpacing:'0.06em', textTransform:'uppercase', fontWeight:600, color:badge.fg, background:badge.bg, borderRadius:4, padding:'2px 8px' }}>
              {badge.label}
            </span>
          </div>
          <div style={{ fontSize:11, color:C.inkMute }}>
            {ticket.days.length} ngày · {paidLabel}
            {ticket.sepay_ref && <span style={{ fontFamily:MONO, marginLeft:8, color:C.inkSoft }}>#{ticket.sepay_ref}</span>}
          </div>
        </div>
        <div style={{ fontWeight:600, fontSize:18, color:C.emeraldDeep, textAlign:'right', whiteSpace:'nowrap' }}>
          {fmt(ticket.total_amount)}<span style={{ fontSize:12, color:C.inkMute, marginLeft:1, fontWeight:500 }}>₫</span>
        </div>
      </div>
      {/* days */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, paddingLeft:54 }}>
        {ticket.days.map(d => (
          <span key={d.date} style={{ fontSize:11, color:C.inkSoft, background:C.paperWarm, border:`1px solid ${C.hl}`, borderRadius:4, padding:'3px 8px' }}>
            {['CN','T2','T3','T4','T5','T6','T7'][new Date(d.date).getDay()]} {getShortDate(d.date)}
            <span style={{ color:C.inkMute, marginLeft:6 }}>{fmt(d.amount)}₫</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── DebtPage ─────────────────────────────────────────────────────────────────
export function DebtPage({ isAdmin = false }) {
  const [tab, setTab]           = useState('debt'); // 'debt' | 'history'
  const [debtFilter, setDebtFilter] = useState('active'); // 'active' | 'done'
  const [paidTickets, setPaidTickets] = useState([]);
  const [showHistoryNew, setShowHistoryNew] = useState(() => !localStorage.getItem('history_tab_seen'));
  const [debts, setDebts]       = useState([]);
  const [selected, setSelected] = useState(null);
  const [qrPerson, setQrPerson] = useState(null);
  const [toasts, setToasts]     = useState([]);
  const [justPaid, setJustPaid] = useState(new Set());
  const toastId = useRef(0);

  function addToast(name) {
    const id = ++toastId.current;
    setToasts(ts => [...ts, { id, person_name: name }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4500);
  }

  function refresh() {
    api.getAccumulatedDebts().then(d => {
      const sorted = [...d.debts].sort((a,b) => b.total_amount - a.total_amount);
      setDebts(sorted);
      setSelected(prev =>
        prev ? sorted.find(x => x.person_name === prev.person_name) ?? null
             : sorted[0] ?? null
      );
    });
  }

  function refreshPaid() {
    api.getPaidTickets().then(d => setPaidTickets(d.tickets)).catch(() => {});
  }

  useEffect(() => { refresh(); refreshPaid(); }, []);

  useSSE({
    payment_confirmed: ({ person_name }) => {
      addToast(person_name);
      setJustPaid(s => new Set([...s, person_name]));
      setTimeout(() => {
        setJustPaid(s => { const n = new Set(s); n.delete(person_name); return n; });
        refresh();
        refreshPaid();
      }, 3000);
    },
    payment_updated: () => { refresh(); refreshPaid(); },
    debt_updated:    () => { refresh(); },
    // Meals changing must re-pull the accumulated totals, otherwise the cached
    // total_amount drifts from the freshly-fetched per-day breakdown.
    order_submitted: () => { refresh(); },
    order_confirmed: () => { refresh(); },
    order_cancelled: () => { refresh(); },
    order_deleted:   () => { refresh(); },
  });

  const totalOwed = debts.reduce((s, d) => s + d.total_amount, 0);
  const now = new Date();
  const dayLabel = ['CN','T2','T3','T4','T5','T6','T7'][now.getDay()];
  const timeLabel = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:C.cream, fontFamily:"'Be Vietnam Pro', system-ui, sans-serif", fontSize:14, fontFeatureSettings:"'ss01', 'ss02'" }}>
      <style>{GLOBAL_CSS}</style>
      <PaymentSuccessToast toasts={toasts} />

      {/* ── Tab bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:2, padding:'10px 20px 0', flexShrink:0, borderBottom:`1px solid ${C.hl}`, background:C.cream }}>
        {[['debt','Công nợ'],['history','Lịch sử ăn']].map(([key, label]) => (
          <button key={key} onClick={() => {
            setTab(key);
            if (key === 'history' && showHistoryNew) {
              setShowHistoryNew(false);
              localStorage.setItem('history_tab_seen', '1');
            }
          }} style={{
            padding:'7px 16px', border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
            background: tab === key ? C.paper : 'transparent',
            color:      tab === key ? C.ink    : C.inkMute,
            borderRadius:'8px 8px 0 0',
            boxShadow:  tab === key ? `0 -1px 0 ${C.hlStrong} inset, 1px 0 0 ${C.hlStrong} inset, -1px 0 0 ${C.hlStrong} inset` : 'none',
            transition: 'all 130ms',
            marginBottom: tab === key ? -1 : 0,
            position: 'relative', zIndex: tab === key ? 1 : 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {label}
            {key === 'history' && showHistoryNew && (
              <span style={{
                background: '#ef4444', color: '#fff',
                fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
                padding: '1px 5px', borderRadius: 20,
                lineHeight: '14px',
              }}>NEW</span>
            )}
          </button>
        ))}
      </div>

      {/* ── History calendar tab ── */}
      {tab === 'history' && (
        <div style={{ flex:1, overflow:'hidden' }}>
          <HistoryPage />
        </div>
      )}

      {/* ── Debt tab ── */}
      {tab === 'debt' && <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>

      {/* ── Status filter ── */}
      <div style={{ display:'flex', gap:8, padding:'14px 36px 0', flexShrink:0 }}>
        {(isAdmin ? [
          ['active', `● Còn nợ · ${debts.length}`, C.magentaDeep, C.rose],
          ['done',   `✓ Đã trả · ${paidTickets.length}`, C.emeraldDeep, C.sage],
        ] : []).map(([key, label, fg, bg]) => {
          const on = debtFilter === key;
          return (
            <button key={key} onClick={() => setDebtFilter(key)} style={{
              padding:'7px 16px', borderRadius:999, cursor:'pointer', fontSize:12, fontWeight:700,
              border:`1px solid ${on ? fg : C.hlStrong}`,
              background: on ? bg : C.paper,
              color: on ? fg : C.inkMute,
              transition:'all 130ms',
            }}>{label}</button>
          );
        })}
      </div>

      {/* ── Done: paid ticket list ── */}
      {debtFilter === 'done' && (
        <div className="dt-main-scroll" style={{ flex:1, overflowY:'auto', minWidth:0 }}>
          <div style={{ padding:'22px 36px 36px', display:'flex', flexDirection:'column', gap:12, maxWidth:920, margin:'0 auto', width:'100%' }}>
            {paidTickets.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:C.inkMute, fontSize:13 }}>Chưa có thanh toán nào.</div>
            ) : (
              paidTickets.map((t, i) => <PaidTicketCard key={`${t.sepay_ref ?? t.person_name}-${t.paid_at}-${i}`} ticket={t} />)
            )}
          </div>
        </div>
      )}

      {/* ── Active: two-pane debt view ── */}
      {debtFilter === 'active' && <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

      {/* ── Main list ── */}
      <div className="dt-main-scroll" style={{ flex:1, overflowY:'auto', minWidth:0 }}>
        <div style={{ padding:'28px 36px 36px', display:'flex', flexDirection:'column', gap:22, maxWidth:920, margin:'0 auto', width:'100%' }}>

          {/* crumbs */}
          <div className="dt-reveal dt-r1" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:10, letterSpacing:'0.22em', textTransform:'uppercase', color:C.inkMute }}>
            <span>Lunch Time / Công nợ</span>
            <span>Cập nhật {dayLabel} · {timeLabel}</span>
          </div>

          {/* hero */}
          <header className="dt-reveal dt-r2" style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:24, paddingBottom:22, borderBottom:`1px solid ${C.hl}`, alignItems:'end' }}>
            <div>
              <h1 style={{ fontWeight:600, fontSize:32, lineHeight:1.1, letterSpacing:'-0.02em', color:C.ink, margin:0 }}>
                Tổng <em style={{ fontStyle:'normal', color:C.magentaInk }}>dư nợ</em>
              </h1>
              <p style={{ fontSize:13, color:C.inkSoft, marginTop:10, maxWidth:480, lineHeight:1.5 }}>
                Danh sách nhân viên chưa thanh toán tiền cơm tất cả các tuần.
              </p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, auto)', gap:26, textAlign:'right' }}>
              {[
                { label:'Số người nợ', val: <>{debts.length}<span style={{ fontSize:16, color:C.inkMute, fontWeight:400, marginLeft:4 }}>người</span></> },
                { label:'Tổng dư nợ',  val: <><em style={{ fontStyle:'normal', color:C.magentaInk }}>{fmtK(totalOwed)}</em><span style={{ fontSize:16, color:C.inkMute, fontWeight:400, marginLeft:2 }}>k</span></> },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize:9, letterSpacing:'0.22em', textTransform:'uppercase', color:C.inkMute, fontWeight:600 }}>{s.label}</div>
                  <div style={{ fontFamily:"'Be Vietnam Pro', sans-serif", fontWeight:600, fontSize:24, lineHeight:1.1, marginTop:6, color:C.ink, letterSpacing:'-0.02em' }}>{s.val}</div>
                </div>
              ))}
            </div>
          </header>

          {/* list */}
          <div className="dt-reveal dt-r3" style={{ background:C.paper, border:`1px solid ${C.hlStrong}`, borderRadius:6, overflow:'hidden' }}>
            <div style={{ padding:'14px 22px', borderBottom:`1px solid ${C.hl}`, background:C.paperCool }}>
              <span style={{ fontWeight:600, fontSize:14, color:C.ink }}>Còn nợ · {debts.length} người</span>
            </div>
            <div>
              {debts.length === 0 && (
                <div style={{ padding:40, textAlign:'center', color:C.inkMute, fontSize:13 }}>Không có ai nợ cả! 🎉</div>
              )}
              {debts.map((d, idx) => {
                const isSelected = selected?.person_name === d.person_name;
                const isMulti    = d.unpaid_days.length > 1;
                const isPaid     = justPaid.has(d.person_name);
                return (
                  <div key={d.person_name} className="dt-pcard"
                    onClick={() => !isPaid && setSelected(d)}
                    style={{ position:'relative', padding:'14px 22px', borderBottom: idx < debts.length-1 ? `1px solid ${C.hl}` : 'none', background: isPaid ? C.paperCool : isSelected ? C.rose : C.paper, boxShadow: isSelected && !isPaid ? `inset 0 0 0 1px ${C.magenta}` : 'none', cursor: isPaid ? 'default' : 'pointer', display:'grid', gridTemplateColumns:'40px 1fr auto auto', alignItems:'center', gap:14, transition:'background 500ms ease', opacity: isPaid ? 0.5 : 1 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:C.rose, color:C.magentaInk, fontWeight:600, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {(d.person_name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div style={{ fontSize:14, fontWeight:600, color:C.ink }}>{d.person_name}</div>
                    <div style={{ fontSize:11, color: isMulti ? C.amber : C.inkMute, fontWeight:500, whiteSpace:'nowrap', background: isMulti ? C.amberSoft : 'transparent', padding: isMulti ? '2px 8px' : 0, borderRadius:999 }}>
                      {d.unpaid_days.length} ngày
                    </div>
                    <div style={{ fontWeight:600, fontSize:16, color: isMulti ? C.amber : C.ink, textAlign:'right' }}>
                      {fmtK(d.total_amount)}<span style={{ fontSize:12, color:C.inkMute, marginLeft:1, fontWeight:500 }}>k</span>
                    </div>
                    {isPaid && (
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:22, pointerEvents:'none' }}>
                        <span style={{ fontSize:9, letterSpacing:'0.2em', textTransform:'uppercase', fontWeight:700, color:C.emeraldDeep, background:C.sage, border:`1px solid ${C.emeraldDeep}`, borderRadius:4, padding:'4px 10px' }}>
                          ✓ Đã thanh toán
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* ── Inspector panel ── */}
      <div style={{ position:'relative', width:460, flexShrink:0, height:'100%', borderLeft:`1px solid ${C.hlStrong}`, background:C.paperWarm, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {selected ? (
          <AccInspectorPanel
            key={selected.person_name}
            debt={selected}
            isAdmin={isAdmin}
            onFullScreen={() => setQrPerson({ person: selected.person_name, amount: selected.total_amount })}
            onAllPaid={() => { refresh(); setSelected(null); }}
          />
        ) : (
          <InspectorEmpty />
        )}
        {justPaid.has(selected?.person_name) && (
          <div style={{ position:'absolute', inset:0, background:'rgba(255,255,255,0.7)', backdropFilter:'blur(3px)', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <div style={{ background:'white', border:`1.5px solid ${C.emeraldDeep}`, borderRadius:12, padding:'22px 40px', display:'flex', alignItems:'center', gap:16, boxShadow:'0 8px 32px rgba(5,150,105,0.2)' }}>
              <span style={{ fontSize:32, color:C.emeraldDeep }}>✓</span>
              <div>
                <div style={{ fontSize:11, letterSpacing:'0.2em', textTransform:'uppercase', color:C.emeraldDeep, fontWeight:700 }}>Đã thanh toán</div>
                <div style={{ fontSize:14, fontWeight:600, color:C.ink, marginTop:4 }}>{selected.person_name}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {qrPerson && (
        <QRModal person={qrPerson.person} amount={qrPerson.amount} week={null} onClose={() => setQrPerson(null)} />
      )}
      </div>} {/* end active two-pane */}
      </div>} {/* end debt tab */}
    </div>
  );
}
