import { useEffect, useRef } from 'react';

export function useSSE(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const es = new EventSource('/api/events');
    const entries = Object.keys(handlersRef.current);
    entries.forEach(event => {
      es.addEventListener(event, (e) => handlersRef.current[event]?.(JSON.parse(e.data)));
    });
    return () => es.close();
  }, []);
}
