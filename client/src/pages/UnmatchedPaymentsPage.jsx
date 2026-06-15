import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';

const ADMIN_PASSWORD_KEY = 'lunch_admin_pw';

function getStoredPassword() {
  return sessionStorage.getItem(ADMIN_PASSWORD_KEY) || '';
}

export default function UnmatchedPaymentsPage() {
  const [events, setEvents] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [assigns, setAssigns] = useState({});

  const load = useCallback(() => {
    Promise.all([api.getUnmatched(), api.getAccumulatedDebts()])
      .then(([u, d]) => { setEvents(u.events); setDebts(d.debts); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useSSE({ payment_queued: load });

  async function handleResolve(id, action, extra = {}) {
    const password = getStoredPassword() || prompt('Admin password:');
    if (!password) return;
    sessionStorage.setItem(ADMIN_PASSWORD_KEY, password);
    setResolving(id);
    try {
      await api.resolveUnmatched(id, { action, password, ...extra });
      load();
    } catch {
      alert('Lỗi hoặc sai mật khẩu');
      sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
    } finally {
      setResolving(null);
    }
  }

  function handleAssignChange(id, field, value) {
    setAssigns(a => ({ ...a, [id]: { ...(a[id] || {}), [field]: value } }));
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--color-text-muted)' }}>Đang tải...</div>;

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, color: 'var(--color-text)' }}>Thanh toán chờ xử lý</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
        {events.length === 0 ? 'Không có giao dịch nào cần xử lý.' : `${events.length} giao dịch chưa khớp.`}
      </p>

      {events.map(evt => {
        const assign = assigns[evt.id] || {};
        const personOptions = debts.map(d => d.person_name);
        const selectedPerson = assign.person_name || evt.suggestion?.person_name || '';
        const weekOptions = selectedPerson
          ? (debts.find(d => d.person_name === selectedPerson)?.unpaid_weeks || [])
          : [];
        const selectedWeek = assign.week || (weekOptions[0]?.week ?? '');
        const selectedYear = assign.year || (weekOptions[0]?.year ?? new Date().getFullYear());

        return (
          <div key={evt.id} style={{ background: 'var(--color-card)', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: 'var(--shadow-card)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{evt.received_at?.slice(0, 16).replace('T', ' ')}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#059669' }}>{Math.round(evt.transfer_amount).toLocaleString('en-US')}đ</span>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', marginBottom: 10, wordBreak: 'break-all', background: '#f8f8f8', borderRadius: 6, padding: '6px 8px' }}>
              {evt.raw_content?.slice(0, 120)}{evt.raw_content?.length > 120 ? '…' : ''}
            </div>

            {evt.suggestion && (
              <div style={{ fontSize: 11, color: '#a855f7', marginBottom: 8 }}>
                Gợi ý: <strong>{evt.suggestion.person_name}</strong> — còn nợ {Math.round(evt.suggestion.unpaid_total).toLocaleString('en-US')}đ
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedPerson}
                onChange={e => handleAssignChange(evt.id, 'person_name', e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
              >
                <option value="">-- Chọn người --</option>
                {personOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>

              <select
                value={`${selectedWeek}|${selectedYear}`}
                onChange={e => {
                  const [w, y] = e.target.value.split('|');
                  handleAssignChange(evt.id, 'week', parseInt(w));
                  handleAssignChange(evt.id, 'year', parseInt(y));
                }}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
              >
                <option value="|">-- Tuần --</option>
                {weekOptions.map(w => (
                  <option key={`${w.week}|${w.year}`} value={`${w.week}|${w.year}`}>
                    Tuần {w.week}/{w.year} ({(w.amount / 1000).toFixed(0)}k)
                  </option>
                ))}
              </select>

              <button
                disabled={!selectedPerson || !selectedWeek || resolving === evt.id}
                onClick={() => handleResolve(evt.id, 'assign', { person_name: selectedPerson, week: selectedWeek, year: selectedYear })}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, background: '#059669', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, opacity: (!selectedPerson || !selectedWeek) ? 0.5 : 1 }}
              >
                Gán
              </button>

              <button
                disabled={resolving === evt.id}
                onClick={() => handleResolve(evt.id, 'ignore')}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, background: '#f3f4f6', color: '#6b7280', border: 'none', cursor: 'pointer' }}
              >
                Bỏ qua
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
