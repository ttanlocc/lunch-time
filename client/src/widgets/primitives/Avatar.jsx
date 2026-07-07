// client/src/widgets/primitives/Avatar.jsx
// Circle + last-name initial, colored by the shared name-hash palette. Same
// pattern the Spending section uses inline today.
import { getPalette, getInitial } from '../theme.js';

export function Avatar({ name, size = 22 }) {
  const { bg, text } = getPalette(name);
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: text,
      fontSize: Math.round(size * 0.46), fontWeight: 800, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {getInitial(name)}
    </span>
  );
}
