// client/src/widgets/widgets/WeatherCard.jsx
// descriptor.data = getWeatherSnapshot() output: { location, current, forecast }.
// Big current temp, feels-like, condition + icon; a one-day-ahead rain heads-up
// from forecast[1] (today's `current` has no rain-probability field).
import { C } from '../theme.js';
import { Card } from '../primitives/Card.jsx';
import { getWeatherIcon } from '../../lib/insightIcons.js';

// Hand-picked accent per WMO code (small fixed set, no name-hash needed).
function weatherAccent(code) {
  if (code === 0 || code === 1 || code === 2) return C.amber;
  if ([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return C.violet;
  if ([95, 96, 99].includes(code)) return C.magentaDeep;
  return C.inkMute;
}

export function WeatherCard({ descriptor }) {
  const w = descriptor.data;
  const c = w.current;
  const { Icon } = getWeatherIcon(c.weather_code);
  const accent = weatherAccent(c.weather_code);
  const tomorrow = w.forecast?.[1];

  return (
    <Card style={{ background: C.paperWarm }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 800, color: C.ink, lineHeight: 1 }}>
            {Math.round(c.temperature_c)}°
          </div>
          <div style={{ fontSize: 12, color: C.inkMute, marginTop: 4 }}>
            cảm giác {Math.round(c.feels_like_c)}°
          </div>
        </div>
        <Icon size={40} color={accent} />
      </div>
      <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600, marginTop: 8 }}>{c.condition}</div>
      {tomorrow && (
        <div style={{ fontSize: 11.5, color: C.magentaInk, marginTop: 6 }}>
          ☔ {new Date(`${tomorrow.date}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short' })} {tomorrow.rain_chance_pct}%
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.inkMute, marginTop: 8 }} title={w.location}>{w.location}</div>
    </Card>
  );
}
