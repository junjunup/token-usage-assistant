// T11.5: tell a page whether its window is on screen. A hidden or never-shown Electron window still reports
// document.visibilityState "visible", so its once-a-second countdowns kept running and repainting while the app sat
// in the tray (about 1.5% of a core in the 2026-10-30 measurement, docs/perf-baseline.md §4). The page pauses its
// timers while this says false (src/Live.jsx). Nothing here changes refresh intervals or data.

/** @param {any} win BrowserWindow */
function shown(win) {
  return !win.isDestroyed() && win.isVisible() && !win.isMinimized();
}

/**
 * Send 'assistant:visibility' now and on every show / hide / minimise / restore, and after each page load.
 * @param {any} win BrowserWindow
 */
function reportVisibility(win) {
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send('assistant:visibility', shown(win));
  };
  for (const event of ['show', 'hide', 'minimize', 'restore']) win.on(event, send);
  win.webContents.on('did-finish-load', send);
}

module.exports = { reportVisibility, shown };
