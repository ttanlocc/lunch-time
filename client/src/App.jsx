// client/src/App.jsx
import { Routes, Route } from 'react-router-dom';
import { UserLayout } from './layouts/UserLayout.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { OrderPage } from './pages/OrderPage.jsx';
import { ImportMenuPage } from './pages/ImportMenuPage.jsx';
import { SummaryPage } from './pages/SummaryPage.jsx';
import { AdminOrderPage } from './pages/AdminOrderPage.jsx';
import { DebtPage } from './pages/DebtPage.jsx';

export default function App() {
  return (
    <Routes>
      {/* User routes */}
      <Route element={<UserLayout />}>
        <Route path="/" element={<OrderPage />} />
        <Route path="/import" element={<ImportMenuPage />} />
        <Route path="/summary" element={<SummaryPage />} />
      </Route>

      {/* Admin routes */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminOrderPage />} />
        <Route path="/admin/summary" element={<SummaryPage isAdmin />} />
        <Route path="/admin/debt" element={<DebtPage />} />
      </Route>
    </Routes>
  );
}
