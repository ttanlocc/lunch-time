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
  importMenu: (text) => request('POST', '/menu/import', { text }),
  lockMenu: () => request('POST', '/menu/lock'),
  getOrdersToday: () => request('GET', '/orders/today'),
  submitOrder: (body) => request('POST', '/orders', body),
  getDebts: (week, year) => request('GET', `/debts?week=${week}&year=${year}`),
};
