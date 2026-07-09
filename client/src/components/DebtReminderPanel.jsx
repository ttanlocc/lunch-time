import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { Mail, Send, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

// Admin panel: manage each person's email and fire the debt-reminder emails.
// The server's Friday-16:00 cron does this automatically; this panel is for
// filling in emails and for sending a reminder on demand.
export default function DebtReminderPanel({ password, onAuthError }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [drafts, setDrafts] = useState({});   // name -> email being typed
  const [savingName, setSavingName] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    api.getPeople().then(r => {
      setPeople(r.people);
      setDrafts(Object.fromEntries(r.people.map(p => [p.name, p.email || ''])));
    }).catch(() => {});
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Only people who currently owe money — that's who gets reminded.
  const debtors = people.filter(p => p.total_amount > 0);
  const withEmail = debtors.filter(p => (p.email || '').trim()).length;

  async function saveEmail(name) {
    const email = (drafts[name] || '').trim();
    setSavingName(name);
    try {
      await api.savePerson({ name, email, password });
      load();
    } catch (e) {
      if (e.message.includes('401')) onAuthError?.();
    } finally { setSavingName(null); }
  }

  async function send({ only = null, dryRun = false } = {}) {
    setSending(true); setResult(null);
    try {
      const r = await api.sendReminders({ password, only, dryRun });
      setResult(r);
    } catch (e) {
      if (e.message.includes('401')) onAuthError?.();
      else setResult({ error: e.message });
    } finally { setSending(false); }
  }

  const fmtK = n => `${Math.round(n / 1000)}k`;

  return (
    <div style={{ margin: '0 16px 12px', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 0.7s linear infinite}`}</style>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer',
          background: 'linear-gradient(135deg,#faf5ff 0%,#f0f9ff 100%)',
        }}
      >
        <Mail size={16} style={{ color: '#7c3aed' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>Nhắc nợ qua email</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {debtors.length} người đang nợ · {withEmail} đã có email · tự gửi Thứ 6 16h
          </div>
        </div>
        {open ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
      </div>

      {open && (
        <div style={{ padding: '12px 16px' }}>
          {debtors.length === 0 && (
            <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 13, padding: '12px 0' }}>
              Không có ai đang nợ 🎉
            </div>
          )}

          {debtors.map(p => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 90, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>{fmtK(p.total_amount)}</div>
              </div>
              <input
                type="email"
                placeholder="email@cty.com"
                value={drafts[p.name] ?? ''}
                onChange={e => setDrafts(d => ({ ...d, [p.name]: e.target.value }))}
                onBlur={() => { if ((drafts[p.name] || '') !== (p.email || '')) saveEmail(p.name); }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                style={{
                  flex: 1, padding: '6px 10px', borderRadius: 8,
                  border: `1.5px solid ${(p.email || '').trim() ? '#bbf7d0' : '#e2e8f0'}`,
                  fontSize: 13, outline: 'none', background: '#fff',
                }}
              />
              <button
                onClick={() => send({ only: p.name })}
                disabled={sending || !(p.email || '').trim()}
                title="Gửi cho riêng người này"
                style={{
                  padding: '6px 10px', borderRadius: 8, border: 'none', flexShrink: 0,
                  background: (p.email || '').trim() ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : '#e2e8f0',
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: (p.email || '').trim() && !sending ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {savingName === p.name ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
              </button>
            </div>
          ))}

          {debtors.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => send({ dryRun: false })}
                disabled={sending || withEmail === 0}
                style={{
                  flex: 1, padding: '9px 14px', borderRadius: 10, border: 'none',
                  background: withEmail ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : '#e2e8f0',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: withEmail && !sending ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: withEmail ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
                }}
              >
                {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                Gửi nhắc tất cả ({withEmail})
              </button>
              <button
                onClick={() => send({ dryRun: true })}
                disabled={sending}
                style={{
                  padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0',
                  background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600,
                  cursor: sending ? 'default' : 'pointer',
                }}
              >
                Gửi thử
              </button>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12 }}>
              {result.error ? (
                <div style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={13} /> Lỗi: {result.error}
                </div>
              ) : (
                <>
                  {!result.configured && (
                    <div style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600 }}>
                      <AlertCircle size={13} /> SMTP chưa cấu hình — chưa gửi thật (set SMTP_USER/SMTP_PASS).
                    </div>
                  )}
                  {result.sent?.length > 0 && (
                    <div style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={13} /> Đã gửi {result.sent.length}: {result.sent.map(s => s.person_name).join(', ')}
                    </div>
                  )}
                  {result.skipped?.length > 0 && (
                    <div style={{ color: '#94a3b8', marginTop: 4 }}>
                      Bỏ qua {result.skipped.length}: {result.skipped.map(s => `${s.person_name} (${s.reason})`).join(', ')}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
