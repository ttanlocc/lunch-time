// client/src/lib/insightIcons.js
//
// Decorative icon lookups for the insights page. Purely presentational — if a
// dish name or weather code doesn't match anything below, callers fall back to
// a neutral default. Never treat these as authoritative data.
import {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning,
  Pizza, Sandwich, Soup, UtensilsCrossed, Fish, Drumstick, Beef, Egg, Salad, Coffee,
} from 'lucide-react';

// WMO weather codes (https://open-meteo.com/en/docs) grouped by icon.
const WEATHER_ICON_RULES = [
  { codes: [0], Icon: Sun, color: '#f59e0b' },
  { codes: [1, 2], Icon: CloudSun, color: '#f59e0b' },
  { codes: [3], Icon: Cloud, color: '#64748b' },
  { codes: [45, 48], Icon: CloudFog, color: '#94a3b8' },
  { codes: [51, 53, 55], Icon: CloudDrizzle, color: '#38bdf8' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], Icon: CloudRain, color: '#0284c7' },
  { codes: [71, 73, 75], Icon: CloudSnow, color: '#7dd3fc' },
  { codes: [95, 96, 99], Icon: CloudLightning, color: '#7c3aed' },
];

/** WMO weather_code -> { Icon, color }. Unknown/missing code falls back to Cloud. */
export function getWeatherIcon(code) {
  const rule = WEATHER_ICON_RULES.find(r => r.codes.includes(code));
  return rule ? { Icon: rule.Icon, color: rule.color } : { Icon: Cloud, color: '#94a3b8' };
}

// Ordered keyword tests against a lowercased dish name — first match wins.
// Order matters: dish-format words (phở/bún/cơm/pizza…) are checked before
// protein words (gà/heo/cá…) since e.g. "Cơm gà" reads better as a rice icon
// than a chicken one, and "cá " is checked first so "Cá cơm kho tiêu" (anchovy)
// doesn't get mistaken for a rice dish via the "cơm" substring.
const DISH_ICON_RULES = [
  { test: n => n.includes('pizza'), Icon: Pizza, color: '#f97316' },
  { test: n => n.includes('burger') || n.includes('lotteria') || n.includes('lotte') || n.includes('bánh mì'), Icon: Sandwich, color: '#ca8a04' },
  { test: n => n.startsWith('cá') || n.includes('tôm') || n.includes('hải sản'), Icon: Fish, color: '#0284c7' },
  { test: n => n.includes('phở') || n.includes('bún') || n.includes('mì') || n.includes('hủ tiếu') || n.includes('nui') || n.includes('miến'), Icon: Soup, color: '#f59e0b' },
  { test: n => n.includes('cơm'), Icon: UtensilsCrossed, color: '#16a34a' },
  { test: n => n.includes('gà'), Icon: Drumstick, color: '#d97706' },
  { test: n => n.includes('heo') || n.includes('sườn') || n.includes('thịt') || n.includes('nem') || n.includes('chả') || n.includes('bò'), Icon: Beef, color: '#dc2626' },
  { test: n => n.includes('trứng') || n.includes('ốp la'), Icon: Egg, color: '#eab308' },
  { test: n => n.includes('đậu hũ') || n.includes('gỏi') || n.includes('rau'), Icon: Salad, color: '#10b981' },
  { test: n => n.includes('trà') || n.includes('cà phê') || n.includes('nước'), Icon: Coffee, color: '#06b6d4' },
];

/** Dish name -> { Icon, color }. Unmatched names fall back to a neutral utensils icon. */
export function getDishIcon(name) {
  const n = (name || '').toLowerCase();
  const rule = DISH_ICON_RULES.find(r => r.test(n));
  return rule ? { Icon: rule.Icon, color: rule.color } : { Icon: UtensilsCrossed, color: '#64748b' };
}
