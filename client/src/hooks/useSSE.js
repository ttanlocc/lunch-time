// client/src/hooks/useSSE.js
import { useEffect } from 'react';

export function useSSE(handlers) {
  useEffect(() => {
    const es = new EventSource('/api/events');
    const subs = Object.entries(handlers).map(([event, handler]) => {
      es.addEventListener(event, (e) => handler(JSON.parse(e.data)));
      return event;
    });
    return () => es.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
