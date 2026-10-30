// @ts-check
// Where the tray / menu-bar panel opens (T7.6 macOS, T11.2 Windows). Pure: no Electron, no I/O.
// - macOS: below the menu-bar icon, centred on it, with an arrow pointing at the icon.
// - Windows: against the taskbar edge the tray icon sits on — above a bottom taskbar, below a top one, beside a
//   left or right one — like the system's own tray flyouts. No arrow. The edge is the display edge nearest to the
//   icon, so an auto-hidden taskbar (work area = whole display) still works.
// - Always inside the display's work area, on the display that holds the icon.

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {'top'|'bottom'|'left'|'right'} Edge
 * @typedef {{ x: number, y: number, edge: Edge, anchorX: number|null, arrow: number }} Placement
 */

const MAC_MARGIN = 8;
const WIN_GAP = 12;
const ARROW = 8; // points above the card for the arrow that points at the menu-bar icon

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.round(Math.max(lo, Math.min(v, hi)));

/**
 * The display edge nearest to the icon centre (ties: bottom, then the others in a fixed order).
 * @param {{ x: number, y: number }} c
 * @param {Rect} bounds
 * @returns {Edge}
 */
function nearestEdge(c, bounds) {
  /** @type {[Edge, number][]} */
  const d = [
    ['bottom', bounds.y + bounds.height - c.y],
    ['top', c.y - bounds.y],
    ['right', bounds.x + bounds.width - c.x],
    ['left', c.x - bounds.x],
  ];
  return d.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
}

/**
 * @param {{ tray: Rect, display: { bounds: Rect, workArea: Rect }, width: number, height: number,
 *   platform: string }} o height: the panel window's current height, in points
 * @returns {Placement}
 */
function panelPlacement({ tray, display, width, height, platform }) {
  const area = display.workArea;
  const c = { x: tray.x + tray.width / 2, y: tray.y + tray.height / 2 };
  if (platform === 'darwin') {
    const x = clamp(c.x - width / 2, area.x + MAC_MARGIN, area.x + area.width - width - MAC_MARGIN);
    return {
      x,
      y: Math.round(tray.y + tray.height + 6 - ARROW),
      edge: 'top',
      anchorX: Math.round(c.x - x),
      arrow: ARROW,
    };
  }
  const edge = nearestEdge(c, display.bounds);
  const xIn = (/** @type {number} */ v) => clamp(v, area.x + WIN_GAP, area.x + area.width - width - WIN_GAP);
  const yIn = (/** @type {number} */ v) => clamp(v, area.y + WIN_GAP, area.y + area.height - height - WIN_GAP);
  if (edge === 'bottom') return { x: xIn(c.x - width / 2), y: yIn(Infinity), edge, anchorX: null, arrow: 0 };
  if (edge === 'top') return { x: xIn(c.x - width / 2), y: yIn(-Infinity), edge, anchorX: null, arrow: 0 };
  if (edge === 'left') return { x: xIn(-Infinity), y: yIn(c.y - height / 2), edge, anchorX: null, arrow: 0 };
  return { x: xIn(Infinity), y: yIn(c.y - height / 2), edge, anchorX: null, arrow: 0 };
}

module.exports = { panelPlacement, nearestEdge, ARROW };
