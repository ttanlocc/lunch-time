import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api.js';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:          '#fbf7f3',
  paper:       '#ffffff',
  ink:         '#2b2235',
  inkSoft:     '#6b5d75',
  inkMute:     '#a89aae',
  hl:          'rgba(43,34,53,0.07)',
  hlStrong:    'rgba(43,34,53,0.12)',
  rose:        '#fbe7ee',
  roseDeep:    '#f5c6d9',
  magenta:     '#e8a8c4',
  magentaInk:  '#a55c7d',
  magentaDeep: '#c47899',
  sage:        '#d1fae5',
  sageDeep:    '#a7f3d0',
  emerald:     '#059669',
  emeraldInk:  '#065f46',
};

// ─── Constants ────────────────────────────────────────────────────────────────
const VN_DAY_HEADERS = ['THỨ 2', 'THỨ 3', 'THỨ 4', 'THỨ 5', 'THỨ 6', 'THỨ 7', 'CHỦ NHẬT'];
const VN_DAYS_FULL   = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

// Common Vietnamese public holidays (MM-DD)
const VN_HOLIDAYS = {
  '01-01': 'Tết Dương lịch',
  '04-30': 'Giải phóng miền Nam',
  '05-01': 'Quốc tế Lao động',
  '09-02': 'Quốc khánh',
};

const AVATAR_PALETTES = [
  { bg: '#fce7f3', text: '#be185d' },
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#fee2e2', text: '#991b1b' },
  { bg: '#e0f2fe', text: '#0c4a6e' },
  { bg: '#f0fdf4', text: '#14532d' },
  { bg: '#fdf4ff', text: '#701a75' },
  { bg: '#fff7ed', text: '#9a3412' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getPalette(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

function getInitial(name) {
  const parts = name.trim().split(' ').filter(Boolean);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}

function fmtK(n) {
  return Math.round(n / 1000).toLocaleString('en-US');
}

function dateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isWeekend(ds) {
  const d = new Date(ds + 'T00:00:00').getDay();
  return d === 0 || d === 6;
}

function holidayLabel(ds) {
  return VN_HOLIDAYS[ds.slice(5)] ?? null;
}

// ─── PersonChip ───────────────────────────────────────────────────────────────
function PersonChip({ name, selected, onClick }) {
  const { bg, text } = getPalette(name);
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 10px 4px 4px', borderRadius: 999, border: 'none', cursor: 'pointer',
      background: selected ? C.ink : bg + '99',
      color: selected ? '#fff' : C.ink,
      fontSize: 12, fontWeight: 600, flexShrink: 0,
      transition: 'all 130ms ease',
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: selected ? 'rgba(255,255,255,0.22)' : bg,
        color: selected ? '#fff' : text,
        fontSize: 10, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {getInitial(name)}
      </span>
      {name}
    </button>
  );
}

// ─── DayCell — all-people view ────────────────────────────────────────────────
function DayCellAll({ ds, dayData, maxCount, isToday }) {
  const weekend  = isWeekend(ds);
  const holiday  = holidayLabel(ds);
  const count    = dayData?.count ?? 0;
  const total    = dayData?.total ?? 0;
  const people   = dayData?.people ?? [];
  const hasData  = count > 0;
  const allPaid  = hasData && people.every(p => p.paid);

  const ratio = maxCount > 0 ? count / maxCount : 0;
  let bg = C.paper;
  if (hasData && !holiday) {
    if (allPaid) bg = ratio >= 0.65 ? C.sageDeep : C.sage;
    else         bg = ratio >= 0.65 ? C.roseDeep : C.rose;
  }

  // Show unpaid first so they stay visible when truncated to 4
  const sortedPeople = [...people].sort((a, b) => Number(a.paid) - Number(b.paid));
  const showPeople = sortedPeople.slice(0, 4);
  const extra      = sortedPeople.length - showPeople.length;

  return (
    <div style={{
      border: `1px solid ${isToday ? C.magentaInk : C.hlStrong}`,
      borderRadius: 8,
      minHeight: 108,
      backgroundColor: bg,
      overflow: 'hidden',
      boxShadow: isToday ? `inset 0 0 0 1px ${C.magentaInk}` : 'none',
      backgroundImage: !hasData && !holiday && weekend
        ? 'repeating-linear-gradient(45deg,rgba(43,34,53,.03) 0,rgba(43,34,53,.03) 2px,transparent 2px,transparent 10px)'
        : 'none',
    }}>
      {/* Day number row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 8px 0' }}>
        <span style={{
          fontSize: 13, fontWeight: isToday ? 800 : 500, lineHeight: 1,
          color: isToday ? C.magentaInk : hasData ? C.ink : C.inkMute,
        }}>
          {new Date(ds + 'T00:00:00').getDate()}
        </span>
        {ratio >= 0.65 && hasData && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.magentaInk, marginTop: 4, flexShrink: 0 }} />
        )}
      </div>

      {/* Holiday badge */}
      {holiday && (
        <div style={{ padding: '2px 8px 0', fontSize: 9, fontWeight: 700, color: C.magentaDeep, letterSpacing: '0.04em' }}>
          · NGHỈ LỄ
          <div style={{ fontSize: 10, fontWeight: 400, color: C.inkSoft, letterSpacing: 0, marginTop: 1 }}>{holiday}</div>
        </div>
      )}

      {/* Body */}
      {hasData && !holiday && (
        <div style={{ padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, color: C.inkSoft, fontWeight: 500 }}>{count} người ăn</div>
          <div style={{ fontSize: 11, color: C.inkMute }}>{fmtK(total)}k tổng</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
            {showPeople.map(p => {
              const pal = getPalette(p.name);
              return (
                <span key={p.name} title={p.paid ? `${p.name} · đã trả` : p.name} style={{
                  position: 'relative', flexShrink: 0,
                  width: 18, height: 18,
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: pal.bg, color: pal.text,
                    fontSize: 8, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: p.paid ? 0.4 : 1,
                  }}>
                    {getInitial(p.name)}
                  </span>
                  {p.paid && (
                    <span style={{
                      position: 'absolute', bottom: -2, right: -2,
                      width: 10, height: 10, borderRadius: '50%',
                      background: C.emerald, color: '#fff',
                      fontSize: 7, fontWeight: 800, lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1.5px solid #fff',
                    }}>✓</span>
                  )}
                </span>
              );
            })}
            {extra > 0 && <span style={{ fontSize: 9, color: C.inkMute, fontWeight: 600 }}>+{extra}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DayCell — single person view ─────────────────────────────────────────────
function DayCellPerson({ ds, dayData, personName, isToday }) {
  const weekend    = isWeekend(ds);
  const holiday    = holidayLabel(ds);
  const personData = dayData?.people?.find(p => p.name === personName);
  const ate        = !!personData;
  const paid       = ate && personData.paid;
  const paidAt     = paid ? personData.paid_at : null;
  const [showPaidHint, setShowPaidHint] = useState(false);

  useEffect(() => {
    if (!showPaidHint) return;
    const onClickAway = () => setShowPaidHint(false);
    // defer so the opening click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('click', onClickAway), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', onClickAway); };
  }, [showPaidHint]);

  // paid → green pastel, ate but unpaid → rose, not ate → paper
  const cellBg = paid ? C.sage : ate ? C.rose : C.paper;
  const accentColor = paid ? C.emeraldInk : C.magentaInk;

  return (
    <div style={{
      border: `1px solid ${isToday ? accentColor : C.hlStrong}`,
      borderRadius: 8,
      minHeight: 108,
      backgroundColor: cellBg,
      overflow: 'hidden',
      backgroundImage: !ate && !holiday && weekend
        ? 'repeating-linear-gradient(45deg,rgba(43,34,53,.03) 0,rgba(43,34,53,.03) 2px,transparent 2px,transparent 10px)'
        : 'none',
    }}>
      {/* Day number + status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 8px 0' }}>
        <span style={{
          fontSize: 13, fontWeight: isToday ? 800 : 500, lineHeight: 1,
          color: isToday ? accentColor : ate ? C.ink : C.inkMute,
        }}>
          {new Date(ds + 'T00:00:00').getDate()}
        </span>
        {/* Chỉ hiện tick xanh khi đã thanh toán — bấm để xem thời gian trả */}
        {paid && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowPaidHint(v => !v); }}
              title={paidAt ? `Đã trả: ${new Date(paidAt).toLocaleString('vi-VN')}` : 'Đã thanh toán'}
              style={{
                width: 18, height: 18, borderRadius: '50%',
                background: C.emerald, color: '#fff',
                fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer', padding: 0,
              }}
            >✓</button>
            {showPaidHint && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', top: 22, right: 0, zIndex: 10,
                  background: C.ink, color: '#fff',
                  fontSize: 10, fontWeight: 500, lineHeight: 1.4,
                  padding: '6px 8px', borderRadius: 6,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                {paidAt
                  ? <>Đã trả lúc<br/><b>{new Date(paidAt).toLocaleString('vi-VN')}</b></>
                  : 'Đã thanh toán'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Holiday badge */}
      {holiday && (
        <div style={{ padding: '2px 8px 0', fontSize: 9, fontWeight: 700, color: C.magentaDeep, letterSpacing: '0.04em' }}>
          · NGHỈ LỄ
          <div style={{ fontSize: 10, fontWeight: 400, color: C.inkSoft, letterSpacing: 0, marginTop: 1 }}>{holiday}</div>
        </div>
      )}

      {/* Body — hiện khi có ăn */}
      {ate && (
        <div style={{ padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: accentColor }}>{fmtK(personData.subtotal)}k</div>
          {personData.items.slice(0, 2).map((item, i) => (
            <div key={i} style={{ fontSize: 10, color: C.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.item_name}
              {item.note && <span style={{ color: C.magentaDeep }}> [{item.note}]</span>}
            </div>
          ))}
          {personData.items.length > 2 && (
            <div style={{ fontSize: 10, color: C.inkMute }}>+ {personData.items.length - 2} món</div>
          )}
        </div>
      )}

      {!ate && !holiday && !weekend && (
        <div style={{ padding: '4px 8px', fontSize: 11, color: C.inkMute }}>— không ăn</div>
      )}
    </div>
  );
}

// ─── CalendarView ─────────────────────────────────────────────────────────────
function CalendarView({ month, year, days, selectedPerson, onPrev, onNext }) {
  const today = new Date().toISOString().slice(0, 10);

  const cells = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay  = new Date(year, month, 0).getDate();
    const offset   = (firstDay.getDay() + 6) % 7; // Mon=0 … Sun=6
    const arr = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= lastDay; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [month, year]);

  const maxCount = Math.max(...Object.values(days).map(d => d.count), 1);

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Month nav + legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <NavBtn onClick={onPrev}>‹</NavBtn>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.ink, minWidth: 130, textAlign: 'center' }}>
            Tháng {month} · {year}
          </span>
          <NavBtn onClick={onNext}>›</NavBtn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, color: C.inkMute }}>
          {[['ÍT NGƯỜI', C.rose], ['ĐÔNG', C.roseDeep], ['NGHỈ', C.paper]].map(([label, bg]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, border: `1px solid ${C.hlStrong}`, background: bg, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {VN_DAY_HEADERS.map((d, i) => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
            color: i >= 5 ? C.magenta : C.inkMute, padding: '3px 0',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, idx) => {
          if (!day) return (
            <div key={`empty-${idx}`} style={{ minHeight: 108, borderRadius: 8, background: 'transparent' }} />
          );
          const ds       = dateStr(year, month, day);
          const dayData  = days[ds];
          const isToday  = ds === today;
          return selectedPerson ? (
            <DayCellPerson key={ds} ds={ds} dayData={dayData} personName={selectedPerson} isToday={isToday} />
          ) : (
            <DayCellAll key={ds} ds={ds} dayData={dayData} maxCount={maxCount} isToday={isToday} />
          );
        })}
      </div>
    </div>
  );
}

// ─── ListView ─────────────────────────────────────────────────────────────────
function ListView({ days, selectedPerson }) {
  const sorted = Object.entries(days).sort(([a], [b]) => a.localeCompare(b));
  const filtered = selectedPerson
    ? sorted.filter(([, d]) => d.people.some(p => p.name === selectedPerson))
    : sorted;

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: C.inkMute, fontSize: 13 }}>
        {selectedPerson ? `${selectedPerson} chưa ăn trong tháng này` : 'Không có dữ liệu'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, paddingBottom: 16 }}>
      {filtered.map(([ds, dayData]) => {
        const d        = new Date(ds + 'T00:00:00');
        const dateLabel = `${VN_DAYS_FULL[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
        const holiday  = holidayLabel(ds);
        const weekend  = isWeekend(ds);
        const personData = selectedPerson
          ? dayData.people.find(p => p.name === selectedPerson)
          : null;

        return (
          <div key={ds} style={{
            background: C.paper,
            border: `1px solid ${C.hlStrong}`,
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {/* Row header */}
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              padding: '10px 14px',
              background: holiday || weekend ? C.bg : C.paper,
              borderBottom: `1px solid ${C.hl}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{dateLabel}</span>
                {holiday && <span style={{ fontSize: 10, color: C.magentaDeep, fontWeight: 600 }}>· NGHỈ LỄ · {holiday}</span>}
              </div>
              <span style={{ fontSize: 12, color: C.inkMute, fontWeight: 500 }}>
                {selectedPerson
                  ? `${fmtK(personData.subtotal)}k`
                  : `${dayData.count} người · ${fmtK(dayData.total)}k`
                }
              </span>
            </div>

            {/* Content */}
            <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedPerson ? (
                personData.items.map((item, i) => (
                  <span key={i} style={{
                    fontSize: 12, color: C.inkSoft,
                    background: C.bg, border: `1px solid ${C.hl}`,
                    borderRadius: 6, padding: '3px 9px',
                  }}>
                    {item.item_name}
                    {item.note && <span style={{ color: C.magentaDeep }}> [{item.note}]</span>}
                  </span>
                ))
              ) : (
                dayData.people.map(p => {
                  const pal = getPalette(p.name);
                  return (
                    <span key={p.name} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '3px 9px 3px 4px', borderRadius: 999,
                      background: pal.bg + 'aa', fontSize: 11, fontWeight: 500, color: C.ink,
                    }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: pal.bg, color: pal.text,
                        fontSize: 8, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${pal.text}22`,
                      }}>
                        {getInitial(p.name)}
                      </span>
                      {p.name}
                    </span>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Small reusable bits ──────────────────────────────────────────────────────
function NavBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      width: 28, height: 28, borderRadius: '50%',
      border: `1px solid ${C.hlStrong}`, background: C.paper,
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16, color: C.inkSoft, lineHeight: 1,
    }}>
      {children}
    </button>
  );
}

function FooterStat({ label, value }) {
  return (
    <div style={{ padding: '0 18px', flexShrink: 0 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.inkMute, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function FooterDiv() {
  return <div style={{ width: 1, height: 28, background: C.hlStrong, flexShrink: 0 }} />;
}

// ─── HistoryPage ──────────────────────────────────────────────────────────────
export function HistoryPage() {
  const now = new Date();
  const [month, setMonth]               = useState(now.getMonth() + 1);
  const [year, setYear]                 = useState(now.getFullYear());
  const [data, setData]                 = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [viewMode, setViewMode]         = useState('calendar');

  useEffect(() => {
    setData(null);
    api.getOrdersForMonth(month, year)
      .then(setData)
      .catch(() => setData({ month, year, people: [], days: {} }));
  }, [month, year]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const days   = data?.days   ?? {};
  const people = data?.people ?? [];

  // ── All-people stats
  const workDays    = Object.keys(days).length;
  const totalOrders = Object.values(days).reduce((s, d) => s + d.count, 0);
  const totalSpend  = Object.values(days).reduce((s, d) => s + d.total, 0);
  const avgPeople   = workDays ? Math.round(totalOrders / workDays) : 0;
  const avgSpend    = workDays ? Math.round(totalSpend / workDays) : 0;
  const avgPerPerson = people.length && workDays
    ? Math.round(totalSpend / people.length)
    : 0;

  // ── Person stats
  const personEntries = useMemo(() => {
    if (!selectedPerson) return [];
    return Object.entries(days).filter(([, d]) => d.people.some(p => p.name === selectedPerson));
  }, [selectedPerson, days]);

  const personDays  = personEntries.length;
  const personTotal = personEntries.reduce((s, [, d]) => {
    const p = d.people.find(p => p.name === selectedPerson);
    return s + (p?.subtotal ?? 0);
  }, 0);
  const personAvg = personDays ? Math.round(personTotal / personDays) : 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: C.bg, fontFamily: "'Be Vietnam Pro', system-ui, sans-serif",
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '18px 36px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink }}>
            Lịch ăn trưa{' '}
            <span style={{ color: C.inkMute, fontWeight: 500, fontSize: 15 }}>
              · Tháng {month} · {year}
            </span>
          </h1>
          {/* View toggle */}
          <div style={{ display: 'flex', border: `1px solid ${C.hlStrong}`, borderRadius: 7, overflow: 'hidden' }}>
            {[['list', 'Danh sách'], ['calendar', 'Lịch']].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '5px 13px', border: 'none',
                background: viewMode === mode ? C.ink : 'transparent',
                color:      viewMode === mode ? '#fff' : C.inkSoft,
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 130ms',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Person filter bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 12 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.inkMute, flexShrink: 0, marginRight: 2 }}>
            Người
          </span>
          {/* All chip */}
          <button onClick={() => setSelectedPerson(null)} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: !selectedPerson ? C.ink : 'rgba(43,34,53,0.08)',
            color:      !selectedPerson ? '#fff' : C.inkSoft,
            fontSize: 12, fontWeight: 700, flexShrink: 0, transition: 'all 130ms',
          }}>
            Tất cả · {people.length} người
          </button>
          {people.map(name => (
            <PersonChip
              key={name}
              name={name}
              selected={selectedPerson === name}
              onClick={() => setSelectedPerson(selectedPerson === name ? null : name)}
            />
          ))}
        </div>
      </div>
      </div>

      {/* ── Calendar / List ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0 36px' }}>
        {!data && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: C.inkMute, fontSize: 13 }}>
            Đang tải...
          </div>
        )}
        {data && viewMode === 'calendar' && (
          <CalendarView
            month={month} year={year}
            days={days}
            selectedPerson={selectedPerson}
            onPrev={prevMonth}
            onNext={nextMonth}
          />
        )}
        {data && viewMode === 'list' && (
          <ListView days={days} selectedPerson={selectedPerson} />
        )}
      </div>
      </div>

      {/* ── Footer stats ── */}
      <div style={{ borderTop: `1px solid ${C.hlStrong}`, flexShrink: 0, background: C.paper, overflowX: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '10px 36px', display: 'flex', alignItems: 'center' }}>
        {selectedPerson ? (
          <>
            <FooterStat label={`Tháng ${month}`} value={`${personDays} ngày ăn`} />
            <FooterDiv />
            <FooterStat label="Lượt" value={`${personDays} / ${workDays} ngày làm việc`} />
            <FooterDiv />
            <FooterStat
              label={`${selectedPerson.split(' ').pop()} – TB/Bữa`}
              value={personDays ? `${fmtK(personAvg)}k` : '—'}
            />
          </>
        ) : (
          <>
            <FooterStat label={`Tháng ${month}`} value={`${workDays} ngày ăn`} />
            <FooterDiv />
            <FooterStat label="Lượt" value={`${totalOrders} lượt`} />
            <FooterDiv />
            <FooterStat label="Trung bình / Ngày" value={workDays ? `${avgPeople} người · ${fmtK(avgSpend)}k` : '—'} />
            <FooterDiv />
            <FooterStat label="Trung bình / Người" value={people.length ? `${fmtK(avgPerPerson)}k` : '—'} />
          </>
        )}
      </div>
      </div>
    </div>
  );
}
