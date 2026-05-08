// client/src/pages/ImportMenuPage.jsx
import { useState } from 'react';
import { api } from '../lib/api.js';

export function ImportMenuPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [done, setDone] = useState(false);

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const r = await api.previewMenu(text);
      setResult(r);
    } catch (e) {
      alert('Lỗi phân tích menu: ' + e.message);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    try {
      await api.importMenu(text);
      setDone(true);
    } catch (e) {
      alert('Lỗi lưu menu: ' + e.message);
    }
  }

  const TAG_STYLES = {
    new: { background: '#dbeafe', color: '#2563eb' },
    on: { background: '#d1fae5', color: '#059669' },
    off: { background: '#f3f4f6', color: '#bbb' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--header-pad)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Import Menu</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>Dán menu từ Zalo — app tự parse và cập nhật</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--content-pad-v) var(--content-pad-h)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--content-gap)', alignContent: 'start' }}>
        {/* Left: paste area */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 8 }}>Paste menu Zalo</div>
          <textarea value={text} onChange={e => { setText(e.target.value); setResult(null); setDone(false); }}
            placeholder={'@All\n- Cơm gà mắm tỏi: 35k\n- Cơm sườn: 30k\n+ bì || chả: 5k/phần\n...'}
            style={{ width: '100%', height: 240, borderRadius: 12, border: '1.5px solid #e0d6f0', background: '#fdf8ff', padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#2d2d3a', resize: 'none', outline: 'none', lineHeight: 1.7 }}
          />
          <button onClick={handleParse} disabled={parsing || !text.trim()} style={{
            width: '100%', padding: 11, borderRadius: 12, border: 'none', marginTop: 10,
            background: text.trim() ? 'linear-gradient(135deg,#93c5fd,#c084fc)' : '#e0d6f0',
            color: text.trim() ? '#fff' : '#bbb', fontSize: 13, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'not-allowed',
          }}>
            {parsing ? '⏳ Đang phân tích...' : '🔍 Phân tích menu'}
          </button>
        </div>

        {/* Right: diff result */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(180,140,220,0.07)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 14 }}>Thay đổi hôm nay</div>

          {!result && <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Paste menu và bấm Phân tích để xem thay đổi</div>}

          {result && (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {result.new_items?.map(name => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f0fb' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{name}</div>
                    <span style={{ ...TAG_STYLES.new, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Mới</span>
                  </div>
                ))}
                {result.available?.map(name => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f0fb' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{name}</div>
                    <span style={{ ...TAG_STYLES.on, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Có</span>
                  </div>
                ))}
                {result.unavailable?.map(name => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f5f0fb' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#ccc', textDecoration: 'line-through' }}>{name}</div>
                    <span style={{ ...TAG_STYLES.off, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Không có</span>
                  </div>
                ))}
              </div>

              {done
                ? <div style={{ background: '#d1fae5', color: '#059669', borderRadius: 12, padding: '12px', textAlign: 'center', fontSize: 14, fontWeight: 700, marginTop: 14 }}>✓ Menu đã cập nhật — Order đang mở!</div>
                : <button onClick={handleConfirm} style={{
                    width: '100%', padding: 12, borderRadius: 12, border: 'none', marginTop: 14,
                    background: 'linear-gradient(135deg,#a7f3d0,#6ee7b7)', color: '#065f46', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                    ✓ Xác nhận — Mở order hôm nay
                  </button>
              }
            </>
          )}
        </div>
      </div>
    </div>
  );
}
