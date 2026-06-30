// client/src/components/PersonReminderBell.jsx
// Per-person notification control that lives in the debt inspector panel header.
// A bell opens a compact popover (dropdown-style, fixed-positioned so the panel's
// overflow:hidden can't clip it) to manage THIS person's notifications: a master
// "Bật thông báo" switch (= people.active) plus a tick per notification type —
// weekly Friday debt, month-end, and payment receipt (= notify_weekly /
// notify_monthend / notify_receipt) — and their email. Person is known from the
// panel, so there's no name picker.
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { api } from '../lib/api.js';
import { Bell, Check, Loader2 } from 'lucide-react';

// Palette mirrors DebtPage `C` so the popover reads as part of the same ticket.
const C = {
  paper:'#ffffff', paperWarm:'#fbf6f1',
  ink:'#2b2235', inkSoft:'#6b5d75', inkMute:'#a89aae',
  hl:'rgba(43,34,53,0.07)', hlStrong:'rgba(43,34,53,0.13)',
  magenta:'#e8a8c4', magentaInk:'#a55c7d',
  rose:'#fbe7ee', emeraldDeep:'#5b9b7f', sage:'#e0eee5',
};
const MONO = "'JetBrains Mono', monospace";

// The three notification types, in send order. `key` maps to the people column
// notify_<key> and to the savePersonPrefs payload field.
const TYPES = [
  { key:'weekly',   label:'Dư nợ thứ 6 hàng tuần', desc:'Chiều thứ 6, kèm QR trả ngay' },
  { key:'monthend', label:'Chốt sổ cuối tháng',     desc:'Khi lương về, tổng dư nợ' },
  { key:'receipt',  label:'Thanh toán thành công',  desc:'Biên nhận sau khi trả' },
];

const CSS = `
  @keyframes prb-pulse { 0%{box-shadow:0 0 0 0 rgba(214,54,127,0.5)} 70%{box-shadow:0 0 0 6px rgba(214,54,127,0)} 100%{box-shadow:0 0 0 0 rgba(214,54,127,0)} }
  @keyframes prb-spin { to { transform: rotate(360deg) } }
  @keyframes prb-pop { from { opacity:0; transform:translateY(-6px) scale(.97) } to { opacity:1; transform:none } }
  @keyframes prb-shake {
    0%,100% { transform:rotate(0) }
    12% { transform:rotate(17deg) } 24% { transform:rotate(-14deg) }
    38% { transform:rotate(10deg) } 52% { transform:rotate(-7deg) }
    66% { transform:rotate(4deg) } 80% { transform:rotate(-2deg) }
  }
  .prb-spin { animation: prb-spin .7s linear infinite }
  .prb-bell svg { transform-origin: 50% 18% }
  /* prb-shake is reserved for a real "new notification" event, not for opening the panel. */
  .prb-bell.prb-shake svg { animation: prb-shake .6s ease-in-out }
  .prb-bell:hover { color:${C.magentaInk} !important; border-color:${C.magenta} !important; background:${C.rose} !important }
  .prb-save:hover { filter: brightness(1.04) }
  .prb-item:not(:disabled):hover { background:${C.paperWarm} }
  @media (prefers-reduced-motion: reduce) {
    .prb-spin, .prb-bell.prb-shake svg, .prb-knob { animation: none !important; transition: none !important }
  }
`;

// Shared row layout: label/desc on the left, toggle on the right. The whole row
// is the hit target (the parent <button> carries role="switch").
const ROW = {
  display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, width:'100%',
  padding:'8px', borderRadius:7, background:'none', border:'none',
  textAlign:'left', fontFamily:'inherit',
};

// Presentational switch. The accessible state lives on the parent button
// (role="switch" + aria-checked); this is just the visual track + knob.
function ToggleVisual({ checked }) {
  return (
    <span aria-hidden="true" style={{
      position:'relative', width:34, height:20, borderRadius:999, flexShrink:0,
      background: checked ? C.magentaInk : C.hlStrong, transition:'background 160ms ease',
    }}>
      <span className="prb-knob" style={{
        position:'absolute', top:2, left: checked ? 16 : 2, width:16, height:16, borderRadius:'50%',
        background:C.paper, boxShadow:'0 1px 2px rgba(43,34,53,0.28)',
        transition:'left 160ms cubic-bezier(.2,.8,.2,1)',
      }} />
    </span>
  );
}

export default function PersonReminderBell({ personName }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Measure the bell and place the popover (fixed) right-aligned beneath it,
  // flipping above when there isn't room below.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const W = 284, H = 412, gap = 8;
    const left = Math.max(12, Math.min(r.right - W, window.innerWidth - W - 12));
    const below = r.bottom + gap;
    const top = below + H > window.innerHeight - 12 ? Math.max(12, r.top - gap - H) : below;
    setPos({ top, left });
  }, [open]);

  return (
    <>
      <style>{CSS}</style>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        aria-label="Cài đặt thông báo"
        aria-expanded={open}
        title="Cài đặt thông báo"
        className="prb-bell"
        style={{
          width:30, height:30, borderRadius:'50%', flexShrink:0,
          border:`1px solid ${open ? C.magenta : C.hlStrong}`,
          background: open ? C.rose : C.paper,
          color: open ? C.magentaInk : C.inkMute,
          cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center',
          transition:'all 150ms ease',
        }}
      >
        <Bell size={14} />
      </button>
      {open && (
        <>
          {/* click-away */}
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:300 }} />
          <Popover personName={personName} pos={pos} onClose={() => setOpen(false)} />
        </>
      )}
    </>
  );
}

function Popover({ personName, pos, onClose }) {
  const [loaded, setLoaded]   = useState(false);
  const [email, setEmail]     = useState('');
  // `enabled` is the master switch (= people.active). It's kept SEPARATE from the
  // per-type prefs so turning the master off only mutes — it never erases which
  // types the person picked. Prefs are loaded raw (unmasked) and saved raw.
  const [enabled, setEnabled] = useState(true);
  const [prefs, setPrefs]     = useState({ weekly:true, monthend:true, receipt:true });
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    let alive = true;
    api.getPeople().then(r => {
      if (!alive) return;
      const me = r.people.find(p => p.name.trim().toLowerCase() === personName.trim().toLowerCase());
      setEmail(me?.email || '');
      setEnabled(me ? me.active !== 0 : true);
      setPrefs({
        weekly:   me ? me.notify_weekly   !== 0 : true,
        monthend: me ? me.notify_monthend !== 0 : true,
        receipt:  me ? me.notify_receipt  !== 0 : true,
      });
      setLoaded(true);
    }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [personName]);

  const anyOn = prefs.weekly || prefs.monthend || prefs.receipt;
  // Email only matters when the master is on AND something would actually send.
  const needEmail = enabled && anyOn && !email.trim();

  const dirty = () => { setSaved(false); setError(''); };
  const toggleMaster = () => { setEnabled(v => !v); dirty(); };
  const toggleType = (k) => { setPrefs(p => ({ ...p, [k]: !p[k] })); dirty(); };

  async function save() {
    setError('');
    const trimmed = email.trim();
    if (enabled && anyOn && !trimmed) { setError('Cần email để tớ gửi nhắc nợ nha.'); return; }
    if (trimmed && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) { setError('Email chưa đúng định dạng.'); return; }
    setSaving(true);
    try {
      await api.savePersonPrefs({
        name: personName, email: trimmed,
        active: enabled, // master switch, stored independently of per-type prefs
        notify_weekly: prefs.weekly, notify_monthend: prefs.monthend, notify_receipt: prefs.receipt,
      });
      setSaved(true);
      setTimeout(onClose, 850);
    } catch {
      setError('Lưu không được, thử lại nhé.');
    } finally { setSaving(false); }
  }

  return (
    <div
      style={{
        position:'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width:284, zIndex:301,
        background:C.paper, border:`1px solid ${C.hlStrong}`, borderRadius:10,
        boxShadow:'0 12px 32px rgba(43,34,53,0.18)', overflow:'hidden',
        fontFamily:"'Be Vietnam Pro', system-ui, sans-serif",
        animation:'prb-pop 180ms cubic-bezier(.2,.8,.2,1) both',
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {/* head */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderBottom:`1px solid ${C.hl}`, background:C.paperWarm }}>
        <Bell size={13} style={{ color:C.magentaInk }} />
        <span style={{ fontSize:12, fontWeight:700, color:C.ink, letterSpacing:'0.01em' }}>Thông báo</span>
      </div>

      <div style={{ padding:'8px 8px 14px' }}>
        {!loaded ? (
          <div style={{ color:C.inkMute, fontSize:12.5, padding:'18px 0', textAlign:'center' }}>Đang tải…</div>
        ) : (
          <>
            {/* master switch — one job: silence or allow everything for this person */}
            <button type="button" role="switch" aria-checked={enabled}
              onClick={toggleMaster} className="prb-item"
              style={{ ...ROW, cursor:'pointer' }}>
              <span style={{ display:'flex', flexDirection:'column', gap:1, minWidth:0 }}>
                <span style={{ fontSize:13, fontWeight:700, color:C.ink }}>Bật thông báo</span>
                <span style={{ fontSize:11, fontWeight:400, color:C.inkSoft,
                               whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  cho {personName}
                </span>
              </span>
              <ToggleVisual checked={enabled} />
            </button>

            <div style={{ height:1, background:C.hl, margin:'4px 8px' }} />

            {/* per-type rows; dimmed + locked while the master is off, but their
                values are preserved so flipping the master back restores choices */}
            <div style={{ opacity: enabled ? 1 : 0.45, transition:'opacity 160ms ease' }}>
              {TYPES.map(t => {
                const on = prefs[t.key];
                return (
                  <button key={t.key} type="button" role="switch" aria-checked={on}
                    disabled={!enabled} onClick={() => toggleType(t.key)} className="prb-item"
                    style={{ ...ROW, cursor: enabled ? 'pointer' : 'default' }}>
                    <span style={{ display:'flex', flexDirection:'column', gap:2, minWidth:0 }}>
                      <span style={{ fontSize:12.5, fontWeight:500, color: on ? C.ink : C.inkSoft }}>{t.label}</span>
                      <span style={{ fontSize:11, fontWeight:400, color:C.inkMute, lineHeight:1.3 }}>{t.desc}</span>
                    </span>
                    <ToggleVisual checked={on} />
                  </button>
                );
              })}
            </div>

            {/* email + save, padded to align with the menu rows' text inset */}
            <div style={{ padding:'0 8px', marginTop:6 }}>
            <label style={{ display:'block', fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:C.inkMute, fontWeight:600, margin:'4px 0 5px' }}>
              Email công ty
            </label>
            <input type="email" value={email}
              onChange={e => { setEmail(e.target.value); dirty(); }}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              placeholder="ten.ban@nois.vn"
              style={{ width:'100%', padding:'8px 10px', borderRadius:6, boxSizing:'border-box',
                       border:`1px solid ${email.trim() ? C.magenta : C.hlStrong}`,
                       fontSize:12.5, fontFamily:MONO, outline:'none', background:C.paper, color:C.ink }} />

            {error
              ? <div style={{ fontSize:11, color:'#dc2626', marginTop:8 }}>{error}</div>
              : needEmail && <div style={{ fontSize:11, color:C.inkSoft, marginTop:8 }}>Cần email để tớ gửi nhắc nợ.</div>}

            <button onClick={save} disabled={saving} className="prb-save"
              style={{ width:'100%', marginTop:12, padding:'9px', borderRadius:8, border:'none',
                       cursor: saving ? 'default' : 'pointer',
                       background: saved ? C.sage : C.magentaInk, color: saved ? C.emeraldDeep : C.paper,
                       fontSize:12.5, fontWeight:700, fontFamily:'inherit',
                       display:'inline-flex', alignItems:'center', justifyContent:'center', gap:7, transition:'all 200ms ease' }}>
              {saving ? <><Loader2 size={14} className="prb-spin" /> Đang lưu…</>
                : saved ? <><Check size={15} /> Đã lưu</>
                : 'Lưu'}
            </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
