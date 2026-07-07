// server/src/services/widgetCatalog.js
//
// The widget registry, server side: type → { label, resolve }. The Lex board
// resolves widgets through this map. validateDescriptor() is a type-existence
// check only for v1 — every descriptor this round is server-authored, so there
// is no untrusted input yet. When aiAnalyst.js starts emitting descriptors, this
// is where per-type zod param schemas get added (same pattern dbTools.js uses).

import { getWeatherSnapshot } from './weather.js';
import { getSuggestionWidgetData, getGoldenSpoon } from './widgetData.js';

export const WIDGET_TYPES = {
  weather:      { label: 'Thời tiết', resolve: () => getWeatherSnapshot() },
  suggestion:   { label: 'Gợi ý',     resolve: () => getSuggestionWidgetData() },
  golden_spoon: { label: 'Thìa Vàng', resolve: () => getGoldenSpoon() },
};

export function validateDescriptor({ type } = {}) {
  return Object.prototype.hasOwnProperty.call(WIDGET_TYPES, type);
}
