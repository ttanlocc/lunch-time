// client/src/pages/InsightsPage.jsx
//
// "Lex" — the third tab inside DebtPage.jsx (alongside Công nợ / Lịch sử ăn),
// reimagined as a full-screen CHAT-THREAD with a "printed lunch receipt" visual
// identity. Two modes:
//   (A) IdentityOnboard — a full-screen sign-up slip: pick your (existing) name,
//       an avatar emoji, and a taste. Persisted via lib/identity.js's profile.
//   (B) LexThread — the conversation. Lex greets you with an opening receipt
//       slip (your debt + meals-this-month + a "món tủ" nudge), then answers
//       free-form questions. Whenever Lex's answer is backed by DB data (server
//       captures the tool calls), that data is printed BELOW the prose as a
//       receipt slip (orders / debt / profile / generic).
//
// Design: reuse DebtPage/HistoryPage tokens (object C) + 'Be Vietnam Pro'. The
// only addition is a MONO stack for the receipt "data" typography. Emoji appear
// ONLY as real content (chosen avatar, taste chips, a single 👋 greeting).

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useProfile, getThreadId } from '../lib/identity.js';

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

// Monospace stack for the "printed data" look — used on every receipt slip.
const MONO = "'Courier New', ui-monospace, monospace";
const DOTTED = '#cbb8c4';
const DASH = 'rgba(43,34,53,0.25)';

// Same 10-pair pastel palette + name-hash HistoryPage.jsx uses for person
// avatars — reused here for the onboarding name rows so everything reads as
// "the same product".
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

const fmtVND = n => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
const fmtK = n => `${Math.round((n || 0) / 1000)}k`;

// First token reads as a natural given name for greetings ("Trang PO" → "Trang").
const firstName = name => (name || '').trim().split(' ').filter(Boolean)[0] || name;

// Hidden context line attached to the opening message so it rides along in the
// chat history — lets follow-ups that point at the greeting slip ("số nợ đó trả
// chưa?") work without Lex re-calling a tool. Not shown in the UI (the opening
// message renders via its `kind`, not its text).
function openingContext(p) {
  const favs = (p.favourites || []).slice(0, 3).map(f => f.name).join(', ');
  const missed = (p.missedFavourites || [])[0];
  return `[Bối cảnh phiếu chào của ${p.name}] Còn nợ ${fmtVND(p.debt_amount)} (${p.debt_days} ngày chưa trả).`
    + ` Tháng này ăn ${p.meals_this_month} bữa, tổng ${p.meals} bữa.`
    + (favs ? ` Món tủ: ${favs}.` : '')
    + (missed ? ` Lâu chưa gọi lại: ${missed.name} (${missed.days_since} ngày).` : '');
}

// Curated onboarding choices.
const AVATAR_EMOJIS = ['🍜', '🍚', '🐱', '🌵', '🍰', '☕', '🌟', '🔥', '🥑', '🐰'];
const TASTE_CHIPS = ['🌶️ Ăn cay', '🥗 Ăn chay', '🦐 Hải sản', '🍖 Ăn mặn', '🥦 Ít dầu mỡ', 'Gì cũng được'];
const CHAT_SUGGESTIONS = ['Tôi còn nợ bao nhiêu?', 'Tuần trước tôi ăn gì?', 'Hôm nay ăn gì hợp tôi?'];

// When Lex calls a read-only tool mid-answer, show a receipt-counter status so
// the wait reads as "Lex is looking it up", not a frozen spinner.
const TOOL_STATUS = {
  get_person_orders: 'Đang lật lại phiếu ăn…',
  get_person_debt: 'Đang dò sổ nợ…',
  get_person_profile: 'Đang xem hồ sơ của bạn…',
  get_top_dishes: 'Đang đếm món hot…',
  get_spending_stats: 'Đang cộng sổ chi…',
  get_overview: 'Đang xem sổ cái…',
  get_longest_uneaten: 'Đang tìm món lâu chưa gọi…',
  get_rotation_suggestion: 'Đang nghĩ món xoay tua…',
};
const toolStatus = t => TOOL_STATUS[t] || 'Đang tra dữ liệu…';

// Read the /chat/stream SSE response, dispatching each event. Returns the final
// `done` payload ({ text, widgets, source, model }). Throws if the stream can't
// start, so the caller can fall back to the buffered /chat endpoint.
async function streamChat(body, { onTool, onDelta }) {
  const res = await fetch('/api/insights/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let done = null;
  for (;;) {
    const { done: d, value } = await reader.read();
    if (d) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = (block.match(/^event: (.+)$/m) || [])[1];
      const dataLine = (block.match(/^data: (.+)$/m) || [])[1];
      if (!dataLine) continue;
      let data;
      try { data = JSON.parse(dataLine); } catch { continue; }
      if (ev === 'tool') onTool?.(data.tool);
      else if (ev === 'delta') onDelta?.(data.text);
      else if (ev === 'done') done = data;
    }
  }
  return done;
}

// ── receipt primitives ───────────────────────────────────────────────────────

// Perforated top strip; `behind` = the colour sitting behind the slip so the
// "holes" punch through to it.
function Perf({ behind = C.paper }) {
  return (
    <div aria-hidden style={{
      height: 7,
      background: `radial-gradient(circle at 5px 7px, ${behind} 2.5px, transparent 3px)`,
      backgroundSize: '11px 7px',
      backgroundRepeat: 'repeat-x',
      backgroundColor: C.paper,
    }} />
  );
}

function Eyebrow({ children, center = false, style }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, letterSpacing: '1.5px', color: C.inkMute,
      textAlign: center ? 'center' : 'left', ...style,
    }}>{children}</div>
  );
}

// item ..... price — a baseline-aligned dotted-leader line.
function Leader({ label, value, valueColor = C.ink }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 12, fontFamily: MONO }}>
      <span style={{ color: C.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, borderBottom: `1px dotted ${DOTTED}`, margin: '0 7px', transform: 'translateY(-3px)' }} />
      <span style={{ fontWeight: 700, color: valueColor, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

// White paper slip with a perforated top and mono body.
function SlipShell({ behind = C.paper, children }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.hlStrong}`, borderRadius: 6, overflow: 'hidden' }}>
      <Perf behind={behind} />
      <div style={{ padding: '11px 14px 14px' }}>{children}</div>
    </div>
  );
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
function dayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]} ${dd}/${mm}`;
}

// Render one captured tool call as a receipt slip. Never throws on odd data.
function Slip({ w, behind = C.paper }) {
  const title = (w.title || '').toUpperCase();

  if (w.type === 'orders') {
    const rows = Array.isArray(w.data) ? w.data : [];
    const total = rows.reduce((s, r) => s + Number(r.price || 0), 0);
    return (
      <SlipShell behind={behind}>
        <Eyebrow center style={{ marginBottom: 10 }}>── {title} · {rows.length} BỮA ──</Eyebrow>
        {rows.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkSoft, textAlign: 'center' }}>Không có bữa nào.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map((r, i) => (
                <Leader
                  key={i}
                  label={`${r.paid ? '✓ ' : ''}${dayLabel(r.date)} · ${r.name}`}
                  value={fmtK(r.price)}
                  valueColor={r.paid ? C.emeraldDeep : C.ink}
                />
              ))}
            </div>
            <div style={{ borderTop: `1px dashed ${DASH}`, marginTop: 9, paddingTop: 8 }}>
              <Leader label="TỔNG" value={fmtK(total)} valueColor={C.magentaDeep} />
            </div>
            {rows.some(r => r.paid) && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.emeraldDeep, marginTop: 7, textAlign: 'right' }}>
                ✓ = đã trả
              </div>
            )}
          </>
        )}
      </SlipShell>
    );
  }

  if (w.type === 'debt') {
    const d = w.data || {};
    const days = Array.isArray(d.unpaid_days) ? d.unpaid_days : [];
    if (!d.total_amount) {
      return (
        <SlipShell behind={behind}>
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkSoft, textAlign: 'center' }}>Không nợ gì 🎉</div>
        </SlipShell>
      );
    }
    return (
      <SlipShell behind={behind}>
        <Eyebrow center style={{ marginBottom: 10 }}>── {title} ──</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {days.map((u, i) => <Leader key={i} label={dayLabel(u.date)} value={fmtK(u.amount)} />)}
        </div>
        <div style={{ borderTop: `1px dashed ${DASH}`, marginTop: 9, paddingTop: 8 }}>
          <Leader label="TỔNG" value={fmtVND(d.total_amount)} valueColor={C.magentaDeep} />
        </div>
      </SlipShell>
    );
  }

  if (w.type === 'profile') {
    const favs = (w.data?.favourites || []).slice(0, 5);
    return (
      <SlipShell behind={behind}>
        <Eyebrow center style={{ marginBottom: 10 }}>── {title} ──</Eyebrow>
        {favs.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkSoft, textAlign: 'center' }}>Chưa có món tủ.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {favs.map((f, i) => <Leader key={i} label={f.name} value={`${f.times_eaten}×`} />)}
          </div>
        )}
      </SlipShell>
    );
  }

  // generic — safe key/value-ish dump, capped in height.
  let dump;
  try { dump = JSON.stringify(w.data, null, 2); } catch { dump = String(w.data); }
  return (
    <SlipShell behind={behind}>
      <Eyebrow center style={{ marginBottom: 10 }}>── {title} ──</Eyebrow>
      <pre style={{
        fontFamily: MONO, fontSize: 11, color: C.ink, margin: 0,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto',
      }}>{dump}</pre>
    </SlipShell>
  );
}

// ── page shell ───────────────────────────────────────────────────────────────

export function InsightsPage() {
  const [profile, setProfile] = useProfile();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      background: C.bg, fontFamily: "'Be Vietnam Pro', system-ui, sans-serif",
    }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin .7s linear infinite}
        @keyframes lexBlink{0%,45%{opacity:1}50%,100%{opacity:0}}
        .lex-caret{color:${C.magentaDeep};font-weight:400;animation:lexBlink 1s steps(1) infinite;margin-left:1px}
        @media (prefers-reduced-motion: reduce){ .spin{animation:none} .lex-caret{animation:none} }
      `}</style>
      {!profile
        ? <IdentityOnboard onDone={setProfile} />
        : <LexThread profile={profile} onChangePerson={() => setProfile(null)} />}
    </div>
  );
}

// ── (A) full-screen onboarding / sign-up ─────────────────────────────────────
function IdentityOnboard({ onDone }) {
  const [people, setPeople] = useState(null); // active names, or null while loading
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [emoji, setEmoji] = useState(AVATAR_EMOJIS[0]);
  const [taste, setTaste] = useState(null);

  useEffect(() => {
    api.getPeople()
      .then(r => setPeople((r.people || []).filter(p => p.active !== 0).map(p => p.name)))
      .catch(() => setPeople([]));
  }, []);

  const q = query.trim().toLowerCase();
  const matches = q && people ? people.filter(n => n.toLowerCase().includes(q)) : [];
  const exact = people?.find(n => n.toLowerCase() === q) || null;
  const chosen = selected || exact;              // an EXACT existing name, or null
  const showHint = q && !selected && !exact && (people?.length ?? 0) > 0 && matches.length === 0;
  const showList = !selected && matches.length > 0;

  function onType(v) { setQuery(v); if (selected) setSelected(null); }
  function pick(name) { setSelected(name); setQuery(name); }
  function start() { if (chosen) onDone({ name: chosen, emoji, taste }); }

  return (
    <div style={{
      flex: 1, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '32px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ background: C.paper, border: `1px solid ${C.hlStrong}`, borderRadius: 8, overflow: 'hidden' }}>
          <Perf behind={C.bg} />
          <div style={{ padding: '18px 22px 22px' }}>
            <Eyebrow center>── LUNCH TIME · LEX ──</Eyebrow>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, textAlign: 'center', marginTop: 12 }}>
              Lex nên gọi bạn là gì nhỉ?
            </div>
            <div style={{ fontSize: 12, color: C.inkSoft, textAlign: 'center', marginTop: 6, lineHeight: 1.5 }}>
              Chọn tên của bạn để Lex nhớ và trò chuyện cho thân — không cần đăng nhập, nhớ trên máy này.
            </div>

            {/* name */}
            <div style={{ marginTop: 20 }}>
              <Eyebrow style={{ marginBottom: 7 }}>LEX GỌI BẠN LÀ…</Eyebrow>
              <input
                value={query}
                onChange={e => onType(e.target.value)}
                placeholder="Gõ tên của bạn…"
                style={{
                  width: '100%', boxSizing: 'border-box', border: `1px solid ${C.hlStrong}`,
                  borderRadius: 8, padding: '10px 13px', fontSize: 13.5, fontFamily: 'inherit',
                  color: C.ink, background: C.paper, outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.magenta; }}
                onBlur={e => { e.currentTarget.style.borderColor = C.hlStrong; }}
              />
              {people === null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.inkMute, fontSize: 12, marginTop: 8 }}>
                  <Loader2 size={14} className="spin" /> Đang tải danh sách…
                </div>
              )}
              {showHint && (
                <div style={{ fontSize: 12, color: C.magentaInk, marginTop: 8 }}>
                  Không tìm thấy — chọn từ danh sách.
                </div>
              )}
              {showList && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                  {matches.map(name => {
                    const { bg, text } = getPalette(name);
                    return (
                      <button key={name} onClick={() => pick(name)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                        borderRadius: 8, border: `1px solid ${C.hl}`, background: C.paper, cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left', transition: 'all 120ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.magenta; e.currentTarget.style.background = C.rose; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.hl; e.currentTarget.style.background = C.paper; }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: '50%', background: bg, color: text, flexShrink: 0,
                          fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{getInitial(name)}</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{name}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.5px', color: C.emeraldDeep }}>✓ CÓ HỒ SƠ</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* avatar */}
            <div style={{ marginTop: 20 }}>
              <Eyebrow style={{ marginBottom: 8 }}>AVATAR</Eyebrow>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {AVATAR_EMOJIS.map(em => {
                  const on = em === emoji;
                  return (
                    <button key={em} onClick={() => setEmoji(em)} style={{
                      width: 40, height: 40, borderRadius: '50%', fontSize: 20, cursor: 'pointer',
                      border: on ? `2px solid ${C.magentaDeep}` : `1px solid ${C.hlStrong}`,
                      background: on ? C.rose : C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 120ms',
                    }}>{em}</button>
                  );
                })}
              </div>
            </div>

            {/* taste */}
            <div style={{ marginTop: 20 }}>
              <Eyebrow style={{ marginBottom: 8 }}>KHẨU VỊ (TUỲ CHỌN)</Eyebrow>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TASTE_CHIPS.map(t => {
                  const on = t === taste;
                  return (
                    <button key={t} onClick={() => setTaste(on ? null : t)} style={{
                      padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 12.5, fontWeight: 600, color: on ? C.magentaInk : C.ink,
                      border: on ? `2px solid ${C.magentaDeep}` : `1px solid ${C.hlStrong}`,
                      background: on ? C.rose : C.paper, transition: 'all 120ms',
                    }}>{t}</button>
                  );
                })}
              </div>
            </div>

            {/* start */}
            <button onClick={start} disabled={!chosen} style={{
              width: '100%', marginTop: 24, padding: '12px 16px', borderRadius: 999, border: 'none',
              background: chosen ? C.magentaDeep : C.hlStrong, color: '#fff', fontFamily: 'inherit',
              fontSize: 14, fontWeight: 700, cursor: chosen ? 'pointer' : 'default', transition: 'background 130ms',
            }}>
              Bắt đầu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── opening receipt slip: "hôm nay của bạn" ──────────────────────────────────
function OpeningSlip({ p }) {
  const missed = (p.missedFavourites || [])[0];
  return (
    <SlipShell behind={C.bg}>
      <Eyebrow center style={{ marginBottom: 10 }}>── HÔM NAY CỦA BẠN ──</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {p.debt_amount > 0
          ? <Leader label="Còn nợ" value={fmtVND(p.debt_amount)} valueColor={C.magentaDeep} />
          : <div style={{ fontFamily: MONO, fontSize: 12, color: C.inkSoft }}>Bạn không nợ gì 🎉</div>}
        <Leader label="Bữa tháng này" value={p.meals_this_month ?? 0} />
      </div>
      {missed && (
        <div style={{
          marginTop: 11, borderLeft: `2px solid ${C.magentaDeep}`, background: C.rose,
          padding: '8px 11px', borderRadius: 4, fontSize: 12, color: C.ink, lineHeight: 1.5,
        }}>
          Đã <b>{missed.days_since} ngày</b> bạn chưa gọi <b>{missed.name}</b> — món tủ của bạn đấy.
        </div>
      )}
    </SlipShell>
  );
}

// ── (B) the chat thread ──────────────────────────────────────────────────────
function LexThread({ profile, onChangePerson }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false); // has the user sent anything yet?
  const endRef = useRef(null);
  const idRef = useRef(0); // monotonic id for the streaming Lex message

  const given = firstName(profile.name);

  // Opening slip: greet + a receipt of the user's own snapshot. Async setState
  // in a mount effect is fine — it is not the auto-scroll effect the lint rule
  // guards.
  useEffect(() => {
    let alive = true;
    api.getPersonInsights(profile.name)
      .then(p => { if (alive) setMessages([{ role: 'lex', kind: 'opening', profile: p, text: openingContext(p) }]); })
      .catch(() => { if (alive) setMessages([{ role: 'lex', text: `Chào ${given} 👋 Lex sẵn sàng rồi, hỏi gì cũng được nhé.` }]); });
    return () => { alive = false; };
  }, [profile.name, given]);

  // Keep the newest message in view (scroll only — no setState here).
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function send(text) {
    const msg = (text ?? '').trim();
    if (!msg || busy) return;
    setOpened(true);
    const history = messages
      .filter(m => m.text)
      .slice(-10)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'lex', text: m.text }));
    const streamId = `lex-${(idRef.current += 1)}`;
    // Push the user's bubble + an empty Lex message we stream into.
    setMessages(m => [
      ...m,
      { role: 'user', text: msg },
      { id: streamId, role: 'lex', text: '', widgets: [], streaming: true, status: 'Lex đang xem…' },
    ]);
    setInput('');
    setBusy(true);
    // Patch just the streaming message (by id) — upd is an object or updater fn.
    const patch = upd => setMessages(m => m.map(x =>
      x.id === streamId ? { ...x, ...(typeof upd === 'function' ? upd(x) : upd) } : x));
    const body = { name: profile.name, message: msg, taste: profile.taste, thread_id: getThreadId(profile.name), history };
    try {
      const done = await streamChat(body, {
        onTool: t => patch({ status: toolStatus(t) }),
        onDelta: d => patch(x => ({ text: x.text + d, status: null })),
      });
      patch(x => ({
        text: (done?.text ?? x.text) || 'Lex chưa trả lời được, thử lại nhé.',
        widgets: done?.widgets || [], streaming: false, status: null, turnId: done?.turn_id || null,
      }));
    } catch {
      // Stream unavailable → fall back to the buffered endpoint.
      try {
        const res = await api.chatWithLex(body);
        patch({ text: res.text, widgets: res.widgets || [], streaming: false, status: null, turnId: res.turn_id || null });
      } catch {
        patch({ text: 'Lex chưa trả lời được, thử lại nhé.', widgets: [], streaming: false, status: null });
      }
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = e => { e.preventDefault(); send(input); };

  return (
    <>
      {/* header */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.hlStrong}`, background: C.paper }}>
        <div style={{
          maxWidth: 680, margin: '0 auto', width: '100%', padding: '12px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, boxSizing: 'border-box',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>Lex</span>
            <span style={{
              fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: C.magentaInk,
              background: C.rose, border: `1px solid ${C.magenta}`, borderRadius: 4, padding: '1px 6px',
            }}>AI</span>
          </div>
          <button onClick={onChangePerson} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px 5px 8px', borderRadius: 999,
            border: `1px solid ${C.hlStrong}`, background: C.paper, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12.5, fontWeight: 600, color: C.ink, transition: 'all 120ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.magenta; e.currentTarget.style.background = C.rose; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.hlStrong; e.currentTarget.style.background = C.paper; }}>
            <span style={{ fontSize: 16 }}>{profile.emoji || '🙂'}</span>
            {given}
          </button>
        </div>
      </div>

      {/* thread */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{
          maxWidth: 680, margin: '0 auto', width: '100%', padding: '18px 18px 8px',
          boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={m.id || i} style={{ alignSelf: 'flex-end', maxWidth: '82%' }}>
                <div style={{
                  background: C.rose, color: C.ink, border: '1px solid rgba(196,120,153,0.28)',
                  borderRadius: '12px 12px 3px 12px', padding: '9px 13px', fontSize: 13, lineHeight: 1.45,
                }}>{m.text}</div>
              </div>
            ) : (
              <LexMessage key={m.id || i} m={m} given={given} name={profile.name} />
            )
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* input bar (+ suggestion chips until the first send) */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.hlStrong}`, background: C.paper }}>
        <div style={{ maxWidth: 680, margin: '0 auto', width: '100%', padding: '12px 18px', boxSizing: 'border-box' }}>
          {!opened && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 11 }}>
              {CHAT_SUGGESTIONS.map(q => (
                <button key={q} onClick={() => send(q)} disabled={busy} style={{
                  padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.hlStrong}`, background: C.paper,
                  cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  color: C.ink, transition: 'all 120ms',
                }}
                onMouseEnter={e => { if (!busy) { e.currentTarget.style.borderColor = C.magenta; e.currentTarget.style.background = C.rose; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.hlStrong; e.currentTarget.style.background = C.paper; }}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Hỏi Lex điều gì đó…"
              style={{
                flex: 1, minWidth: 0, border: `1px solid ${C.hlStrong}`, borderRadius: 999, padding: '10px 16px',
                fontSize: 13, fontFamily: 'inherit', color: C.ink, background: C.paper, outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = C.magenta; }}
              onBlur={e => { e.currentTarget.style.borderColor = C.hlStrong; }}
            />
            <button type="submit" disabled={busy || !input.trim()} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, flexShrink: 0,
              borderRadius: '50%', border: 'none', fontSize: 19, fontWeight: 700,
              background: (busy || !input.trim()) ? C.hlStrong : C.magentaDeep,
              color: '#fff', cursor: (busy || !input.trim()) ? 'default' : 'pointer', transition: 'background 130ms',
            }}>→</button>
          </form>
        </div>
      </div>
    </>
  );
}

const lexAvatar = {
  width: 26, height: 26, borderRadius: '50%', background: C.rose, color: C.magentaInk, flexShrink: 0,
  fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

// One Lex message: an 'L' avatar + prose text, then any data as receipt slips.
// While streaming with no text yet, show the live tool/thinking status instead.
function LexMessage({ m, given, name }) {
  const widgets = m.widgets || [];
  const showStatus = m.streaming && !m.text;
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <span style={lexAvatar}>L</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {m.kind === 'opening' ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>Chào {given} 👋</div>
            <OpeningSlip p={m.profile} />
          </>
        ) : showStatus ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.inkMute, fontSize: 12.5 }}>
            <Loader2 size={14} className="spin" /> {m.status || 'Lex đang xem…'}
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C.ink, whiteSpace: 'pre-wrap' }}>
            {m.text}
            {m.streaming && <span className="lex-caret">▍</span>}
          </div>
        )}
        {widgets.map((w, i) => <Slip key={i} w={w} behind={C.bg} />)}
        {m.turnId && !m.streaming && m.kind !== 'opening' && <FeedbackBar turnId={m.turnId} name={name} />}
      </div>
    </div>
  );
}

// 👍/👎 on a Lex answer. Sends to /chat/feedback (logged to JSONL by turn_id).
// A 👎 reveals an optional free-text box ("what was wrong") — the comment is what
// actually drives optimization, so we make it easy but never required. Optimistic
// + fire-and-forget: the click is logged immediately, the comment as a follow-up.
function FeedbackBar({ turnId, name }) {
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const post = (r, c) => api.sendChatFeedback({
    thread_id: getThreadId(name), turn_id: turnId, name, rating: r, comment: c,
  }).catch(() => {});

  const vote = r => {
    const next = rating === r ? null : r; // click again to undo
    setRating(next);
    setSent(false);
    if (next !== 'down') setComment('');
    if (next) post(next); // capture the signal right away
  };
  const submitComment = e => {
    e.preventDefault();
    const c = comment.trim();
    if (!c) return;
    post('down', c);
    setSent(true);
  };

  const btn = (active, color) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
    borderRadius: 7, cursor: 'pointer', border: `1px solid ${active ? color : C.hlStrong}`,
    background: active ? C.rose : 'transparent', color: active ? color : C.inkMute, transition: 'all 120ms',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: -2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {rating === 'up'
          ? <span style={{ fontSize: 11, color: C.emeraldDeep, fontWeight: 600 }}>Cảm ơn bạn đã thích 🙌</span>
          : rating === 'down'
            ? <span style={{ fontSize: 11, color: C.magentaInk, fontWeight: 600 }}>Cảm ơn — cho Lex biết sai ở đâu nhé?</span>
            : <span style={{ fontSize: 11, color: C.inkMute }}>Câu trả lời có hữu ích không?</span>}
        <button aria-label="Hữu ích" onClick={() => vote('up')} style={btn(rating === 'up', C.emeraldDeep)}>
          <ThumbsUp size={13} />
        </button>
        <button aria-label="Chưa tốt" onClick={() => vote('down')} style={btn(rating === 'down', C.magentaInk)}>
          <ThumbsDown size={13} />
        </button>
      </div>

      {rating === 'down' && (sent ? (
        <span style={{ fontSize: 11, color: C.emeraldDeep, fontWeight: 600 }}>Đã gửi góp ý, cảm ơn bạn! 🙏</span>
      ) : (
        <form onSubmit={submitComment} style={{ display: 'flex', gap: 6, maxWidth: 420 }}>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={500}
            placeholder="Sai/thiếu chỗ nào? (không bắt buộc)"
            style={{
              flex: 1, minWidth: 0, border: `1px solid ${C.hlStrong}`, borderRadius: 8, padding: '6px 11px',
              fontSize: 12, fontFamily: 'inherit', color: C.ink, background: C.paper, outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = C.magenta; }}
            onBlur={e => { e.currentTarget.style.borderColor = C.hlStrong; }}
          />
          <button type="submit" disabled={!comment.trim()} style={{
            border: 'none', borderRadius: 8, padding: '6px 13px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            background: comment.trim() ? C.magentaDeep : C.hlStrong, color: '#fff',
            cursor: comment.trim() ? 'pointer' : 'default', flexShrink: 0,
          }}>Gửi</button>
        </form>
      ))}
    </div>
  );
}
