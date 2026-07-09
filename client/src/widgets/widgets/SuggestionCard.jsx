// client/src/widgets/widgets/SuggestionCard.jsx
// descriptor.data = { headline, meta, chips, text, source, model, cached }.
// The refresh button hits /daily-suggestion?refresh=1 directly and updates only
// this widget's local state (regenerating a suggestion must not refetch the whole
// board). toCardShape() mirrors getSuggestionWidgetData() on the server — keep
// the two derivations in sync.
import { useState } from 'react';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { C } from '../theme.js';
import { Card } from '../primitives/Card.jsx';
import { getPalette } from '../theme.js';
import { getDishIcon } from '../../lib/insightIcons.js';
import { api } from '../../lib/api.js';

function toCardShape(json) {
  const [head, ...rest] = json.highlights || [];
  const metaBits = [];
  if (head?.days_since != null) metaBits.push(`${head.days_since} ngày chưa gọi`);
  if (head?.category) metaBits.push(head.category);
  return {
    headline: head?.name ?? null,
    meta: metaBits.join(' · ') || null,
    chips: rest,
    text: json.text, source: json.source, model: json.model, cached: json.cached,
  };
}

export function SuggestionCard({ descriptor }) {
  const [data, setData] = useState(descriptor.data);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    api.getDailySuggestion(true)
      .then(json => setData(toCardShape(json)))
      .catch(e => setData(prev => ({ ...prev, error: e.message })))
      .finally(() => setLoading(false));
  };

  const source = data?.source;
  const badge = source === 'ai'
    ? { text: `AI · ${data.model || 'MiniMax'}`, bg: C.rose, fg: C.magentaInk }
    : source === 'fallback'
      ? { text: 'Tự động (chưa cấu hình AI)', bg: C.amberSoft, fg: '#92400e' }
      : null;

  return (
    <Card style={{ background: C.paperWarm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: C.ink }}>
          <Sparkles size={15} color={C.magentaInk} /> {descriptor.title || 'Gợi ý'}
        </div>
        <button onClick={refresh} disabled={loading} title="Làm mới" style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
          border: `1px solid ${C.hlStrong}`, background: C.paper, color: C.magentaInk,
          borderRadius: 7, padding: '6px 10px', cursor: loading ? 'default' : 'pointer',
        }}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkMute, fontSize: 14, marginTop: 8 }}>
          <Loader2 size={15} className="spin" /> Đang nghĩ xem hôm nay ăn gì…
        </div>
      ) : data?.error ? (
        <div style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>Không tạo được gợi ý: {data.error}</div>
      ) : (
        <>
          {data?.headline && (
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, margin: '8px 0 2px' }}>{data.headline}</div>
          )}
          {data?.meta && <div style={{ fontSize: 12, color: C.inkMute, marginBottom: 8 }}>{data.meta}</div>}
          {data?.chips?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 8px' }}>
              {data.chips.map(it => {
                const { Icon } = getDishIcon(it.name);
                const { bg, text } = getPalette(it.name);
                return (
                  <span key={it.name} style={{
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
                    color: text, background: bg, border: `1px solid ${C.hlStrong}`,
                    borderRadius: 999, padding: '4px 10px',
                  }}>
                    <Icon size={13} color={text} /> {it.name}
                  </span>
                );
              })}
            </div>
          )}
          {data?.text && (
            <p style={{ margin: '4px 0 10px', fontSize: 13.5, lineHeight: 1.6, color: C.inkSoft }}>{data.text}</p>
          )}
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.fg, padding: '3px 8px', borderRadius: 999 }}>
              {badge.text}{data?.cached ? ' · đã lưu' : ''}
            </span>
          )}
        </>
      )}
    </Card>
  );
}
