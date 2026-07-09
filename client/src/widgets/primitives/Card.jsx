// client/src/widgets/primitives/Card.jsx
// The paper card surface used by every widget. Same style object as the
// `card` const in InsightsPage.jsx.
import { C } from '../theme.js';

export const cardStyle = {
  background: C.paper,
  borderRadius: 8,
  border: `1px solid ${C.hlStrong}`,
  padding: 16,
};

export function Card({ style, children, ...rest }) {
  return <div style={{ ...cardStyle, ...style }} {...rest}>{children}</div>;
}
