// client/src/App.jsx
import { useState } from 'react';
import { Layout } from './components/Layout.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { OrderPage } from './pages/OrderPage.jsx';
import { ImportMenuPage } from './pages/ImportMenuPage.jsx';
import { SummaryPage } from './pages/SummaryPage.jsx';
import { DebtPage } from './pages/DebtPage.jsx';

function getWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `Tuần ${start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

const PAGES = { order: OrderPage, import: ImportMenuPage, summary: SummaryPage, debt: DebtPage };

export default function App() {
  const [page, setPage] = useState('order');
  const Page = PAGES[page];
  return (
    <Layout>
      <Sidebar current={page} onNavigate={setPage} weekLabel={getWeekLabel()} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fdf8ff' }}>
        <Page />
      </main>
    </Layout>
  );
}
