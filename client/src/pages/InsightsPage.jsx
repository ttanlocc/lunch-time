// client/src/pages/InsightsPage.jsx
//
// AI food analyst — third tab inside DebtPage.jsx (alongside Công nợ / Lịch sử
// ăn), styled with the same paper/receipt design tokens as DebtPage.jsx and
// HistoryPage.jsx so all three tabs feel like one product, not three. Numbers
// come straight from /insights/dashboard (deterministic SQL, no LLM). The
// suggestion card calls /insights/daily-suggestion, cached per day server-side;
// the refresh button forces a regenerate.
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import {
  Sparkles, Loader2, Clock, RotateCcw, Flame, Wallet, AlertCircle,
  Users, Utensils, ChefHat,
} from 'lucide-react';
import { getWeatherIcon, getDishIcon } from '../lib/insightIcons.js';
import { WidgetGrid } from '../widgets/WidgetGrid.jsx';

// ─── Design tokens (same values as DebtPage.jsx / HistoryPage.jsx) ───────────
const C = {
  bg:          '#fbf7f3',
  paper:       '#ffffff',
  paperWarm:   '#fbf6f1',
  ink:         '#2b2235',
  inkSoft:     '#6b5d75',
  inkMute:     '#a89aae',
  hl:          'rgba(43,34,53,0.07)',
  hlStrong:    'rgba(43,34,53,0.12)',
  rose:        '#fbe7ee',
  magenta:     '#e8a8c4',
  magentaInk:  '#a55c7d',
  magentaDeep: '#c47899',
  violet:      '#b8a4d4',
  emerald:     '#8fc1ab',
  emeraldDeep: '#5b9b7f',
  emeraldInk:  '#065f46',
  amber:       '#d4a373',
  amberSoft:   '#f6e8d6',
};

// Same 10-pair pastel palette + name-hash HistoryPage.jsx uses for person
// avatars — reused here for both people and dish icons so unrelated entities
// still read as "the same product" rather than inventing a second system.
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
function getPalette(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}
function getInitial(name) {
  const parts = (name || '?').trim().split(' ').filter(Boolean);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}

// Weather codes are a small fixed set, so they get a hand-picked accent from
// the shared palette rather than the name-hash treatment above.
function weatherAccent(code) {
  if (code === 0 || code === 1 || code === 2) return C.amber;
  if ([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return C.violet;
  if ([95, 96, 99].includes(code)) return C.magentaDeep;
  return C.inkMute; // overcast, fog, snow, unknown
}

const fmtVND = n => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
const fmtK = n => `${Math.round((n || 0) / 1000)}k`;

const card = { background: C.paper, borderRadius: 8, border: `1px solid ${C.hlStrong}`, padding: 16 };
const sectionTitle = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 };

export function InsightsPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [board, setBoard] = useState(null);

  const loadDashboard = useCallback(() => {
    api.getInsightsDashboard().then(setData).catch(e => setErr(e.message));
  }, []);

  const loadBoard = useCallback(() => {
    api.getLexBoard().then(r => setBoard(r.widgets)).catch(e => setErr(e.message));
  }, []);

  useEffect(() => { loadDashboard(); loadBoard(); }, [loadDashboard, loadBoard]);

  if (err) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ ...card, color: '#b91c1c', display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={18} /> Lỗi tải dữ liệu: {err}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      background: C.bg, fontFamily: "'Be Vietnam Pro', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin .7s linear infinite}
        @keyframes ipTwinkle{0%,100%{opacity:.55;transform:scale(.82)}50%{opacity:1;transform:scale(1.15)}}
        .ip-twinkle{animation:ipTwinkle 1.6s ease-in-out infinite;transform-origin:center;display:inline-flex}
        @keyframes ipShimmer{0%{background-position:-120% 0}100%{background-position:220% 0}}
        .ip-ai-tag{background-image:linear-gradient(100deg,${C.magentaDeep} 30%,${C.magenta} 45%,#fff 50%,${C.magenta} 55%,${C.magentaDeep} 70%);background-size:250% 100%;animation:ipShimmer 2.6s ease-in-out infinite}
      `}</style>

      <div style={{ flexShrink: 0 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '18px 36px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={17} color={C.magentaInk} className="ip-twinkle" />
              Lex
              <span className="ip-ai-tag" style={{
                fontSize: 10, fontWeight: 800, color: '#fff', padding: '2px 8px',
                borderRadius: 999, letterSpacing: '0.06em',
              }}>AI</span>
            </h1>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0 36px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {board && <WidgetGrid descriptors={board} />}

          {!data ? (
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, color: C.inkMute }}>
              <Loader2 size={16} className="spin" /> Đang tải số liệu…
            </div>
          ) : (
            <>
              <OverviewStrip o={data.overview} />
              {data.weather && <WeatherForecast weather={data.weather} />}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <LongestUneaten items={data.longestUneaten} />
                <Rotation items={data.rotation} />
              </div>
              <Spending spending={data.spending} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WeatherForecast({ weather }) {
  const { Icon: TodayIcon } = getWeatherIcon(weather.current?.weather_code);
  const todayAccent = weatherAccent(weather.current?.weather_code);
  return (
    <div style={card}>
      <div style={sectionTitle}><TodayIcon size={15} color={todayAccent} /> Dự báo thời tiết — {weather.location}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weather.forecast.length}, 1fr)`, gap: 10 }}>
        {weather.forecast.map((d, i) => {
          const { Icon } = getWeatherIcon(d.weather_code);
          const accent = weatherAccent(d.weather_code);
          return (
            <div key={d.date} style={{
              border: `1px solid ${C.hl}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}>
              <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600 }}>
                {i === 0 ? 'Hôm nay' : new Date(`${d.date}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </div>
              <Icon size={26} color={accent} />
              <div style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>
                {d.max_c}° / {d.min_c}°
              </div>
              <div style={{ fontSize: 11.5, color: C.inkSoft }}>{d.condition}</div>
              <div style={{ fontSize: 11, color: C.magentaInk }}>☔ {d.rain_chance_pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OverviewStrip({ o }) {
  const stats = [
    { label: 'Tổng bữa đã ăn', value: o.total_meals, Icon: Utensils, color: C.magentaDeep },
    { label: 'Số người', value: o.people, Icon: Users, color: C.violet },
    { label: 'Số món khác nhau', value: `${o.distinct_dishes}/${o.catalog_size}`, Icon: ChefHat, color: C.amber },
    { label: 'Tổng chi tiêu', value: fmtVND(o.total_spent), Icon: Wallet, color: C.emeraldDeep },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
      {stats.map(s => (
        <div key={s.label} style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 8, background: C.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <s.Icon size={16} color={s.color} />
          </span>
          <div>
            <div style={{ fontSize: 11, color: C.inkMute, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, marginTop: 2 }}>{s.value}</div>
          </div>
        </div>
      ))}
      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: C.inkMute }}>
        Dữ liệu từ {o.first_date} → {o.last_date}
      </div>
    </div>
  );
}

function LongestUneaten({ items }) {
  const maxDays = Math.max(1, ...items.filter(i => i.days_since != null).map(i => i.days_since));
  return (
    <div style={card}>
      <div style={sectionTitle}><Clock size={15} color={C.magentaInk} /> Món lâu chưa ăn</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.slice(0, 10).map(it => {
          const never = it.days_since == null;
          const pct = never ? 100 : Math.max(6, Math.round((it.days_since / maxDays) * 100));
          const { Icon } = getDishIcon(it.name);
          const { text } = getPalette(it.name);
          return (
            <div key={it.menu_item_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.ink, fontWeight: 600 }}>
                  <Icon size={13} color={text} /> {it.name}
                </span>
                <span style={{ color: never ? C.inkMute : C.magentaInk, fontWeight: 700 }}>
                  {never ? 'chưa từng ăn' : `${it.days_since} ngày`}
                </span>
              </div>
              <div style={{ height: 6, background: C.bg, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: never ? C.hlStrong : C.magenta, borderRadius: 4 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Rotation({ items }) {
  return (
    <div style={card}>
      <div style={sectionTitle}><RotateCcw size={15} color={C.magentaInk} /> Nên xoay tua lại</div>
      <div style={{ fontSize: 11, color: C.inkMute, marginTop: -6, marginBottom: 10 }}>
        Món cả team từng thích nhưng lâu rồi chưa gọi
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {items.length === 0 && <div style={{ color: C.inkMute, fontSize: 13 }}>Chưa có gợi ý xoay tua.</div>}
        {items.slice(0, 8).map((it, i) => {
          const { Icon } = getDishIcon(it.name);
          const { text } = getPalette(it.name);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6, background: C.rose, color: C.magentaInk,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0,
              }}>{i + 1}</span>
              <Icon size={14} color={text} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{it.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.amber, fontWeight: 700 }}>
                <Flame size={12} /> {it.times_eaten}×
              </span>
              <span style={{ fontSize: 11.5, color: C.inkMute, minWidth: 58, textAlign: 'right' }}>
                {it.days_since} ngày
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spending({ spending }) {
  const people = (spending?.perPerson || []).slice(0, 12);
  const max = Math.max(1, ...people.map(p => p.total_spent));
  return (
    <div style={card}>
      <div style={sectionTitle}><Wallet size={15} color={C.emeraldInk} /> Chi tiêu theo người</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {people.map(p => {
          const { bg, text } = getPalette(p.person_name);
          return (
            <div key={p.person_name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: bg, color: text,
                fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
              }}>
                {getInitial(p.person_name)}
              </span>
              <span style={{ width: 90, fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.person_name}
              </span>
              <div style={{ flex: 1, height: 16, background: C.bg, borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(4, Math.round((p.total_spent / max) * 100))}%`, height: '100%', background: C.emeraldDeep, borderRadius: 5 }} />
              </div>
              <span style={{ width: 66, textAlign: 'right', fontSize: 12, fontWeight: 700, color: C.ink }}>{fmtK(p.total_spent)}</span>
              <span style={{ width: 44, textAlign: 'right', fontSize: 11, color: C.inkMute }}>{p.meals} bữa</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
