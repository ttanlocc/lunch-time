// client/src/widgets/WidgetGrid.jsx
// Responsive row: 3 columns at desktop width, wrapping to fewer as it narrows.
import { WidgetRenderer } from './WidgetRenderer.jsx';

export function WidgetGrid({ descriptors = [] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: 14,
    }}>
      {descriptors.map((d, i) => <WidgetRenderer key={d.type ?? i} descriptor={d} />)}
    </div>
  );
}
