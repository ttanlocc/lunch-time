import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { ChevronLeft, ChevronRight, Lock, Unlock, Trash2, CheckCircle2, Circle, AlertCircle } from 'lucide-react';

function getWeekNumber(date = new Date()) {
  const d = new Date(date);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.floor((d - startOfWeek1) / (7 * 86400000)) + 1;
}

function weeksInYear(y) {
  return getWeekNumber(new Date(y, 11, 28));
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr);
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { short: days[d.getDay()], full: `${dd}/${mm}` };
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      role="checkbox"
      aria-checked={checked}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        background: checked ? 'linear-gradient(135deg,#f59e0b,#d97706)' : '#e5e7eb',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
      }} />
    </div>
  );
}

function StatusPill({ isPaid, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 20, border: 'none',
        background: isPaid ? '#dcfce7' : '#fef2f2',
        color: isPaid ? '#16a34a' : '#dc2626',
        fontSize: 11, fontWeight: 700, cursor: onClick && !disabled ? 'pointer' : 'default',
        transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {isPaid
        ? <CheckCircle2 size={11} strokeWidth={2.5} />
        : <Circle size={11} strokeWidth={2.5} />
      }
      {isPaid ? 'Đã trả' : 'Chưa trả'}
    </button>
  );
}

export function AdminManagePage() {
  const [week, setWeek] = useState(getWeekNumber);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState({ days: [] });
  const [password, setPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);

  const isUnlocked = password.length > 0;

  const fetchData = useCallback(() => {
    api.getOrdersForWeek(week, year).then(setData).catch(() => {});
  }, [week, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useSSE({
    debt_updated: fetchData,
    order_submitted: fetchData,
    order_deleted: fetchData,
  });

  function goBack() {
    if (week > 1) setWeek(w => w - 1);
    else { const y = year - 1; setYear(y); setWeek(weeksInYear(y)); }
  }
  function goForward() {
    const max = weeksInYear(year);
    if (week < max) setWeek(w => w + 1);
    else { setYear(y => y + 1); setWeek(1); }
  }

  function handleUnlock() {
    if (passwordInput.trim()) {
      setPassword(passwordInput.trim());
      setPasswordInput('');
      setError('');
    }
  }
  function handleLock() { setPassword(''); setPasswordInput(''); setError(''); }
  function handleAuthError() { setPassword(''); setPasswordInput(''); setError('Sai mật khẩu — nhập lại'); }

  async function togglePaymentStatus(person_name, currentStatus) {
    const targetStatus = currentStatus === 'paid' ? 'pending' : 'paid';
    setLoading(true);
    try {
      await api.overridePayment({ person_name, week, year, status: targetStatus, password });
      fetchData();
    } catch (e) {
      if (e.message.includes('401')) handleAuthError();
    } finally { setLoading(false); }
  }

  async function toggleExcludeDay(person_name, date, currentExcluded) {
    setLoading(true);
    try {
      await api.excludeDay({ person_name, date, excluded: !currentExcluded, password });
      fetchData();
    } catch (e) {
      if (e.message.includes('401')) handleAuthError();
    } finally { setLoading(false); }
  }

  async function handleDeleteOrder(id) {
    setLoading(true);
    try {
      await api.deleteOrder(id);
      setDeletingOrderId(null);
      fetchData();
    } catch (e) {
      if (e.message.includes('401')) handleAuthError();
    } finally { setLoading(false); }
  }

  const days = data.days ?? [];

  // Week summary
  const allPeople = days.flatMap(d => d.people ?? []);
  const uniquePeople = [...new Map(allPeople.map(p => [p.person_name, p])).values()];
  const totalAmount = uniquePeople.reduce((s, p) => s + p.subtotal, 0);
  const paidAmount = uniquePeople.filter(p => p.week_status === 'paid').reduce((s, p) => s + p.subtotal, 0);
  const paidCount = uniquePeople.filter(p => p.week_status === 'paid').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', background: '#fff',
        borderBottom: '1px solid #e2e8f0', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', letterSpacing: '-0.3px' }}>Quản lý nợ</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Xem & chỉnh sửa orders theo ngày</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={goBack} style={navBtnStyle}>
            <ChevronLeft size={15} strokeWidth={2.5} />
          </button>
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Tuần {week}</span>
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>· {year}</span>
          </div>
          <button onClick={goForward} style={navBtnStyle}>
            <ChevronRight size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── Password bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 20px', flexShrink: 0,
        background: isUnlocked ? '#f0fdf4' : '#fafafa',
        borderBottom: `1px solid ${isUnlocked ? '#bbf7d0' : '#e2e8f0'}`,
        transition: 'background 0.3s',
      }}>
        {!isUnlocked ? (
          <>
            <Lock size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              type="password"
              placeholder="Mật khẩu admin..."
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
              style={{
                flex: 1, maxWidth: 220, padding: '6px 12px',
                borderRadius: 8, border: '1.5px solid #e2e8f0',
                fontSize: 13, outline: 'none', background: '#fff',
                transition: 'border-color 0.15s',
              }}
            />
            <button
              onClick={handleUnlock}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
              }}
            >
              <Unlock size={12} /> Mở khóa
            </button>
            {error && (
              <span style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                <AlertCircle size={12} /> {error}
              </span>
            )}
          </>
        ) : (
          <>
            <Unlock size={14} style={{ color: '#16a34a' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>Đã xác thực</span>
            <span style={{ fontSize: 11, color: '#86efac' }}>· Mọi thao tác đã được mở khóa</span>
            <button onClick={handleLock} style={{
              marginLeft: 'auto', padding: '4px 10px', borderRadius: 6,
              border: '1px solid #bbf7d0', background: 'transparent',
              color: '#16a34a', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>Đổi mật khẩu</button>
          </>
        )}
      </div>

      {/* ── Week summary bar ── */}
      {days.length > 0 && (
        <div style={{
          display: 'flex', gap: 0, flexShrink: 0,
          borderBottom: '1px solid #e2e8f0', background: '#fff',
        }}>
          {[
            { label: 'Tổng tuần', value: `${(totalAmount / 1000).toFixed(0)}k`, color: '#7c3aed', bg: '#f5f3ff' },
            { label: 'Đã thu', value: `${(paidAmount / 1000).toFixed(0)}k`, color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Còn lại', value: `${((totalAmount - paidAmount) / 1000).toFixed(0)}k`, color: '#dc2626', bg: '#fef2f2' },
            { label: 'Tỉ lệ', value: `${paidCount}/${uniquePeople.length} người`, color: '#0369a1', bg: '#f0f9ff' },
          ].map(item => (
            <div key={item.label} style={{
              flex: 1, textAlign: 'center', padding: '8px 4px',
              background: item.bg, borderRight: '1px solid #e2e8f0',
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: item.color, letterSpacing: '-0.5px' }}>{item.value}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 1 }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Day cards ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {days.length === 0 && (
          <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 13, marginTop: 60 }}>
            Không có đơn nào tuần này
          </div>
        )}

        {days.map(day => {
          const { short, full } = formatDayLabel(day.date);
          const people = day.people ?? [];
          const dayTotal = people.reduce((s, p) => s + (p.excluded ? 0 : p.subtotal), 0);
          const paidInDay = people.filter(p => p.week_status === 'paid').length;

          return (
            <div key={day.date} style={{
              background: '#fff', borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              overflow: 'hidden',
            }}>
              {/* Day header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px',
                background: 'linear-gradient(135deg,#faf5ff 0%,#f0f9ff 100%)',
                borderBottom: '1px solid #e2e8f0',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', fontWeight: 700, letterSpacing: 0.5 }}>{short}</span>
                  <span style={{ fontSize: 15, color: '#fff', fontWeight: 800, lineHeight: 1.1 }}>{full.slice(0, 2)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{short} {full}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                    {people.length} người · {paidInDay}/{people.length} đã trả
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#7c3aed', letterSpacing: '-0.5px' }}>
                    {(dayTotal / 1000).toFixed(0)}k
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>tổng ngày</div>
                </div>
              </div>

              {/* People rows */}
              {people.map((person, personIdx) => {
                const isPaid = person.week_status === 'paid';
                const rowKey = `${day.date}-${person.person_name}`;

                return (
                  <div
                    key={person.person_name}
                    onMouseEnter={() => setHoveredRow(rowKey)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      borderBottom: personIdx < people.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: hoveredRow === rowKey ? '#fafbff' : '#fff',
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Person header row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px',
                    }}>
                      {/* Avatar */}
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 800, color: '#fff',
                        background: isPaid
                          ? 'linear-gradient(135deg,#4ade80,#16a34a)'
                          : 'linear-gradient(135deg,#f9a8d4,#c084fc)',
                      }}>
                        {(person.person_name?.[0] ?? '?').toUpperCase()}
                      </div>

                      {/* Name + excluded tag */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: '#1e293b',
                          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                        }}>
                          {person.person_name}
                          {person.excluded && (
                            <span style={{
                              fontSize: 9, background: '#fef3c7', color: '#92400e',
                              borderRadius: 6, padding: '2px 7px', fontWeight: 700,
                              border: '1px solid #fde68a', letterSpacing: 0.2,
                            }}>ĐÃ TRẢ RIÊNG</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                          {(person.orders ?? []).length} món ·{' '}
                          <span style={{
                            fontWeight: 700,
                            color: person.excluded ? '#94a3b8' : '#7c3aed',
                            textDecoration: person.excluded ? 'line-through' : 'none',
                          }}>
                            {(person.subtotal / 1000).toFixed(0)}k
                          </span>
                        </div>
                      </div>

                      {/* Status pill */}
                      <StatusPill
                        isPaid={isPaid}
                        onClick={isUnlocked && !loading ? () => togglePaymentStatus(person.person_name, person.week_status) : null}
                        disabled={loading}
                      />

                      {/* Exclude toggle */}
                      {isUnlocked && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ToggleSwitch
                            checked={person.excluded}
                            onChange={() => toggleExcludeDay(person.person_name, day.date, person.excluded)}
                            disabled={loading}
                          />
                        </div>
                      )}
                    </div>

                    {/* Orders list */}
                    <div style={{ paddingLeft: 58, paddingRight: 16, paddingBottom: 10 }}>
                      {(person.orders ?? []).map(order => {
                        const isDeleting = deletingOrderId === order.id;
                        return (
                          <div key={order.id} style={{
                            display: 'flex', alignItems: 'center',
                            padding: '3px 8px', borderRadius: 8,
                            gap: 8, transition: 'background 0.1s',
                          }}>
                            {isDeleting ? (
                              <>
                                <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, flex: 1 }}>
                                  Xóa order này?
                                </span>
                                <button
                                  onClick={() => handleDeleteOrder(order.id)}
                                  disabled={loading}
                                  style={{
                                    padding: '3px 10px', borderRadius: 6, border: 'none',
                                    background: '#dc2626', color: '#fff',
                                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                  }}
                                >Xóa</button>
                                <button
                                  onClick={() => setDeletingOrderId(null)}
                                  style={{
                                    padding: '3px 10px', borderRadius: 6, border: 'none',
                                    background: '#f1f5f9', color: '#64748b',
                                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                  }}
                                >Giữ</button>
                              </>
                            ) : (
                              <>
                                <div style={{
                                  width: 5, height: 5, borderRadius: '50%',
                                  background: '#c084fc', flexShrink: 0,
                                }} />
                                <span style={{
                                  flex: 1, fontSize: 12, color: person.excluded ? '#94a3b8' : '#475569',
                                  textDecoration: person.excluded ? 'line-through' : 'none',
                                }}>
                                  {order.item_name}
                                  {order.note && (
                                    <span style={{ color: '#c084fc', fontStyle: 'italic' }}> · {order.note}</span>
                                  )}
                                </span>
                                <span style={{
                                  fontSize: 12, fontWeight: 700,
                                  color: person.excluded ? '#cbd5e1' : '#7c3aed',
                                  textDecoration: person.excluded ? 'line-through' : 'none',
                                }}>
                                  {(order.price / 1000).toFixed(0)}k
                                </span>
                                {isUnlocked && (
                                  <button
                                    onClick={() => setDeletingOrderId(order.id)}
                                    title="Xóa order"
                                    style={{
                                      width: 20, height: 20, borderRadius: 6, border: 'none',
                                      background: 'transparent', color: '#cbd5e1',
                                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'all 0.15s', padding: 0, flexShrink: 0,
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; }}
                                  >
                                    <Trash2 size={11} strokeWidth={2} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}

                      {/* Exclude day label */}
                      {isUnlocked && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          marginTop: 4, padding: '2px 8px',
                        }}>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            {person.excluded ? '✓ Đã đánh dấu trả riêng hôm này' : 'Toggle để đánh dấu trả riêng hôm này'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navBtnStyle = {
  width: 30, height: 30, borderRadius: 8,
  background: '#f1f5f9', border: '1px solid #e2e8f0',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#7c3aed', transition: 'all 0.15s',
};
