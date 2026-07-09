// client/src/widgets/widgets/GoldenSpoon.jsx
// descriptor.data = [{ rank, name, total_spent, meals }] (0–3 rows). Rank 1 gets
// an accent left border + a slightly larger avatar; ranks 2–3 render plain. An
// empty array is a valid empty state, not an error.
import { C } from '../theme.js';
import { Card } from '../primitives/Card.jsx';
import { Avatar } from '../primitives/Avatar.jsx';

const fmtVND = n => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;

export function GoldenSpoon({ descriptor }) {
  const rows = descriptor.data || [];
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>
        🥄 {descriptor.title || 'Thìa Vàng'}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.inkMute }}>Chưa có dữ liệu tuần này</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => {
            const top = r.rank === 1;
            return (
              <div key={r.name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                borderLeft: top ? `3px solid ${C.amber}` : '3px solid transparent',
                paddingLeft: 8,
              }}>
                <span style={{ width: 16, fontSize: 12, fontWeight: 800, color: top ? C.amber : C.inkMute }}>{r.rank}</span>
                <Avatar name={r.name} size={top ? 30 : 24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.inkMute }}>{r.meals} bữa</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{fmtVND(r.total_spent)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
