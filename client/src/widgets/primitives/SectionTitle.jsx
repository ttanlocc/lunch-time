// client/src/widgets/primitives/SectionTitle.jsx
// Icon + label row atop a widget. Same `sectionTitle` style as InsightsPage.jsx.
import { C } from '../theme.js';

export function SectionTitle({ icon: Icon, iconColor = C.magentaInk, children, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700,
      color: C.ink, marginBottom: 12, ...style,
    }}>
      {Icon && <Icon size={15} color={iconColor} />}
      {children}
    </div>
  );
}
