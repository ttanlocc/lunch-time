// client/src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { UserLayout } from './layouts/UserLayout.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { SummaryPage } from './pages/SummaryPage.jsx';
import { AdminOrderPage } from './pages/AdminOrderPage.jsx';
import { DebtPage } from './pages/DebtPage.jsx';
import { AdminManagePage } from './pages/AdminManagePage.jsx';
import UnmatchedPaymentsPage from './pages/UnmatchedPaymentsPage.jsx';

export default function App() {
  return (
    <Routes>
      {/* User routes */}
      <Route element={<UserLayout />}>
        <Route path="/" element={<DebtPage />} />
      </Route>

      {/* Admin routes */}
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<AdminOrderPage />} />
        <Route path="/admin/summary" element={<SummaryPage isAdmin />} />
        <Route path="/admin/debt" element={<DebtPage isAdmin />} />
        <Route path="/admin/manage" element={<AdminManagePage />} />
        <Route path="/admin/unmatched" element={<UnmatchedPaymentsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
