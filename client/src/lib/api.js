// client/src/lib/api.js
const BASE = '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

export const api = {
  getMenuToday: () => request('GET', '/menu/today'),
  previewMenu: (text) => request('POST', '/menu/preview', { text }),
  importMenu: (text) => request('POST', '/menu/import', { text }),
  lockMenu: () => request('POST', '/menu/lock'),
  getOrdersToday: () => request('GET', '/orders/today'),
  submitOrder: (body) => request('POST', '/orders', body),
  getDebts: (week, year) => request('GET', `/debts?week=${week}&year=${year}`),
  confirmOrder: (person_name) => request('POST', '/orders/confirm', { person_name }),
  getConfirmation: () => request('GET', '/orders/confirmation'),
  updateOrder: (id, body) => request('PUT', `/orders/${id}`, body),
  deleteOrder: (id) => request('DELETE', `/orders/${id}`),
};
