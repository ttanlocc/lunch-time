// server/src/services/weather.js
//
// Current temperature + short forecast for the office (34 Hoàng Việt, Phường
// Tân Sơn Nhất, TP.HCM), used to make food suggestions weather-aware (e.g.
// suggest a cooling dish on a hot day, hot soup on a rainy one). Coordinates
// were geocoded once via OpenStreetMap Nominatim and hardcoded below — the
// address doesn't move, so there's no need to geocode on every request.
//
// Source: Open-Meteo (https://open-meteo.com) — free, no API key required.

const LAT = 10.7935;
const LON = 106.6586;
const LOCATION_LABEL = '34 Hoàng Việt, P. Tân Sơn Nhất, TP.HCM';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 30 * 60 * 1000; // weather doesn't need to be fetched more than every 30min

let _cache = null; // { at: number, data: object }

// WMO weather codes (https://open-meteo.com/en/docs) → short Vietnamese text.
const WMO_TEXT = {
  0: 'trời quang', 1: 'ít mây', 2: 'có mây', 3: 'nhiều mây',
  45: 'sương mù', 48: 'sương mù đóng băng',
  51: 'mưa phùn nhẹ', 53: 'mưa phùn', 55: 'mưa phùn dày',
  61: 'mưa nhỏ', 63: 'mưa vừa', 65: 'mưa to',
  66: 'mưa lạnh', 67: 'mưa lạnh nặng hạt',
  71: 'tuyết nhẹ', 73: 'tuyết vừa', 75: 'tuyết dày',
  80: 'mưa rào nhẹ', 81: 'mưa rào', 82: 'mưa rào lớn',
  95: 'dông', 96: 'dông kèm mưa đá nhẹ', 99: 'dông kèm mưa đá to',
};
const wmoText = code => WMO_TEXT[code] || `mã thời tiết ${code}`;

export function isWeatherCacheFresh() {
  return Boolean(_cache && Date.now() - _cache.at < CACHE_TTL_MS);
}

/**
 * Current conditions + next-3-days outlook. Returns null (never throws) if
 * the upstream API is unreachable — weather is a nice-to-have, not something
 * that should break the suggestion feature.
 */
export async function getWeatherSnapshot() {
  if (isWeatherCacheFresh()) return _cache.data;

  try {
    const url = new URL(FORECAST_URL);
    url.searchParams.set('latitude', LAT);
    url.searchParams.set('longitude', LON);
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation');
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max');
    url.searchParams.set('timezone', 'Asia/Ho_Chi_Minh');
    url.searchParams.set('forecast_days', '3');

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const json = await res.json();

    const data = {
      location: LOCATION_LABEL,
      current: {
        temperature_c: json.current.temperature_2m,
        feels_like_c: json.current.apparent_temperature,
        humidity_pct: json.current.relative_humidity_2m,
        precipitation_mm: json.current.precipitation,
        condition: wmoText(json.current.weather_code),
        weather_code: json.current.weather_code,
      },
      forecast: json.daily.time.map((date, i) => ({
        date,
        min_c: json.daily.temperature_2m_min[i],
        max_c: json.daily.temperature_2m_max[i],
        rain_chance_pct: json.daily.precipitation_probability_max[i],
        condition: wmoText(json.daily.weather_code[i]),
        weather_code: json.daily.weather_code[i],
      })),
    };

    _cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error('[weather] fetch failed:', err?.message || err);
    return _cache?.data ?? null; // serve stale cache if we have any, else null
  }
}

/** One-line Vietnamese summary, handy for prompts and UI. */
export function summarizeWeather(snapshot) {
  if (!snapshot) return null;
  const c = snapshot.current;
  return `${snapshot.location}: hiện ${c.temperature_c}°C (cảm giác ${c.feels_like_c}°C), ${c.condition}, độ ẩm ${c.humidity_pct}%.`;
}
