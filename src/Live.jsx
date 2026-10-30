import { useEffect, useState } from 'react';

// T11.5: whether this window is on screen, from the main process (desktop/window-visibility.cjs). A hidden Electron
// window still reports document.visibilityState "visible", so the timers below would otherwise keep ticking and
// repainting in the tray. The browser preview has no bridge and counts as shown.
let shown = true;
const listeners = new Set();
window.tokenAssistant?.onVisibility?.((value) => {
  shown = value !== false;
  for (const listener of listeners) listener(shown);
});

// T4.5: the current time for countdowns and relative times. Only the component that uses it re-renders on each
// tick, instead of the whole app re-rendering every second. Paused while the window is hidden; on showing again
// it catches up at once.
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(shown);
  useEffect(() => {
    const listener = (value) => {
      setVisible(value);
      if (value) setNow(Date.now());
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, visible]);
  return now;
}

// Renders exactly what children(now) returns (no wrapper element), refreshed every intervalMs.
export function Live({ children, intervalMs = 1000 }) {
  return children(useNow(intervalMs));
}
