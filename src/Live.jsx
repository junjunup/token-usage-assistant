import { useEffect, useState } from 'react';

// T4.5: the current time for countdowns and relative times. Only the component that uses it re-renders on each
// tick, instead of the whole app re-rendering every second.
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Renders exactly what children(now) returns (no wrapper element), refreshed every intervalMs.
export function Live({ children, intervalMs = 1000 }) {
  return children(useNow(intervalMs));
}
