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
  getAccumulatedDebts: () => request('GET', '/debts/accumulated'),
  getPaidTickets: () => request('GET', '/debts/paid'),
  confirmOrder: (person_name) => request('POST', '/orders/confirm', { person_name }),
  getConfirmation: () => request('GET', '/orders/confirmation'),
  updateOrder: (id, body) => request('PUT', `/orders/${id}`, body),
  deleteOrder: (id) => request('DELETE', `/orders/${id}`),
  cancelMyOrder: (person_name) => request('DELETE', `/orders/today/${encodeURIComponent(person_name)}`),
  getPersonUnpaidDetail: (name) => request('GET', `/debts/person/${encodeURIComponent(name)}/unpaid-detail`),
  overridePayment: (body) => request('POST', '/debts/override', body),
  excludeDay: (body) => request('POST', '/debts/exclude-day', body),
  getOrdersForWeek: (week, year) => request('GET', `/orders/week?week=${week}&year=${year}`),
  getOrdersForMonth: (month, year) => request('GET', `/orders/month?month=${month}&year=${year}`),
  getPersonQr: (name) => request('GET', `/debts/person/${encodeURIComponent(name)}/qr`),
  getUnmatched: () => request('GET', '/webhook/unmatched'),
  resolveUnmatched: (id, body) => request('POST', `/webhook/unmatched/${id}/resolve`, body),
  getPeople: () => request('GET', '/debts/people'),
  savePerson: (body) => request('PUT', '/debts/people', body),
  savePersonPrefs: (body) => request('PUT', '/debts/people/me', body),
  sendReminders: (body) => request('POST', '/debts/remind', body),
  getInsightsDashboard: () => request('GET', '/insights/dashboard'),
  getDailySuggestion: (refresh = false) => request('GET', `/insights/daily-suggestion${refresh ? '?refresh=1' : ''}`),
  getLexBoard: () => request('GET', '/insights/lex-board'),
  getPersonInsights: (name) => request('GET', `/insights/person/${encodeURIComponent(name)}`),
  chatWithLex: (body) => request('POST', '/insights/chat', body),
  sendChatFeedback: (body) => request('POST', '/insights/chat/feedback', body),
};
