// client/src/widgets/WidgetRenderer.jsx
// descriptor → component. Guards three failure modes so one widget never blanks
// the page: unknown type, null data, and a runtime render throw (error boundary).
import { Component } from 'react';
import { WIDGET_REGISTRY } from './registry.jsx';
import { Card } from './primitives/Card.jsx';
import { C } from './theme.js';

function FallbackCard({ title, msg }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{title}</div>}
      <div style={{ fontSize: 12.5, color: C.inkMute }}>{msg}</div>
    </Card>
  );
}

class WidgetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error('[widget] render error:', err);
  }
  render() {
    if (this.state.failed) return <FallbackCard title={this.props.title} msg="widget lỗi hiển thị" />;
    return this.props.children;
  }
}

export function WidgetRenderer({ descriptor }) {
  const { type, title, data } = descriptor || {};
  const Comp = WIDGET_REGISTRY[type];
  if (!Comp) return <FallbackCard title={title} msg="widget không hỗ trợ" />;
  if (data == null) return <FallbackCard title={title} msg="chưa có dữ liệu" />;
  return (
    <WidgetErrorBoundary title={title}>
      <Comp descriptor={descriptor} />
    </WidgetErrorBoundary>
  );
}
