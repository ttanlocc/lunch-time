import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { useSSE } from '../hooks/useSSE.js';
import { QRModal } from '../components/QRModal.jsx';

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

export function DebtPage() {
  const currentWeek = getWeekNumber();
  const currentYear = new Date().getFullYear();
  const [week, setWeek] = useState(currentWeek);
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState({ debts: [] });
  const [qrPerson, setQrPerson] = useState(null);

  useEffect(() => { api.getDebts(week, year).then(setData); }, [week, year]);

  useSSE({
    payment_confirmed: ({ person_name, week: w, year: y }) => {
      if (w === week && y === year) {
        setData(d => ({
          ...d,
          debts: d.debts.map(debt =>
            debt.person_name === person_name ? { ...debt, status: 'paid' } : debt
          ),
        }));
        setQrPerson(p => p?.person === person_name ? null : p);
      }
    },
  });

  function goBack() {
    if (week > 1) {
      setWeek(w => w - 1);
    } else {
      const prevYear = year - 1;
      setYear(prevYear);
      setWeek(weeksInYear(prevYear));
    }
  }

  function goForward() {
    const maxWeek = weeksInYear(year);
    if (week < maxWeek) {
      setWeek(w => w + 1);
    } else {
      setYear(y => y + 1);
      setWeek(1);
    }
  }

  const totalAmount = data.debts.reduce((s, d) => s + d.amount, 0);
  const paidAmount = data.debts.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #f5f0fb', background: '#fff', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Công nợ</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>SePay tự xác nhận khi nhận đúng nội dung</div>
        </div>
        <div style={{ background: '#d1fae5', color: '#059669', padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
          Đã thu: {(paidAmount / 1000).toFixed(0)}k / {(totalAmount / 1000).toFixed(0)}k
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={goBack} style={{ fontSize: 18, color: '#c084fc', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}>‹</button>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Tuần {week}</span>
            <span style={{ fontSize: 12, color: '#aaa', marginLeft: 3 }}> · {year}</span>
          </div>
          <button onClick={goForward} style={{ fontSize: 18, color: '#c084fc', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}>›</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.debts.map(d => (
            <div key={d.person_name} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(180,140,220,0.07)', border: '1.5px solid', borderColor: d.status === 'paid' ? '#a7f3d0' : '#f9a8d4', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', background: d.status === 'paid' ? 'linear-gradient(135deg,#6ee7b7,#10b981)' : 'linear-gradient(135deg,#f9a8d4,#c084fc)' }}>
                {(d.person_name?.[0] ?? '?').toUpperCase()}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{d.person_name}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>
                  {d.status === 'paid' ? `SePay · ${d.paid_at ? new Date(d.paid_at).toLocaleDateString('vi-VN') : ''}` : `Chưa thanh toán · Tuần ${week}`}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: d.status === 'paid' ? '#059669' : '#ec4899' }}>
                  {(d.amount / 1000).toFixed(0)}k
                </div>
                {d.status === 'paid'
                  ? <span style={{ background: '#d1fae5', color: '#059669', padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>✓ Đã trả</span>
                  : <button onClick={() => setQrPerson({ person: d.person_name, amount: d.amount })} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#93c5fd,#818cf8)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      📲 Hiện QR
                    </button>
                }
              </div>
            </div>
          ))}
          {data.debts.length === 0 && (
            <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, marginTop: 40 }}>Chưa có đơn nào tuần này</div>
          )}
        </div>
      </div>

      {qrPerson && (
        <QRModal person={qrPerson.person} amount={qrPerson.amount} week={week} onClose={() => setQrPerson(null)} />
      )}
    </div>
  );
}
