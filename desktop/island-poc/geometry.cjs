// Island POC (T7.1) geometry. Development only: this directory is excluded from packages (electron-builder.yml).
// Pure functions so the coordinate conversion can be tested without a Mac.

// JXA that reads every NSScreen's frame, safe-area top inset and the two menu-bar areas beside the notch.
// AppKit coordinates: origin at the bottom-left of the main screen, units are points.
const NSSCREEN_JXA =
  'ObjC.import("AppKit");JSON.stringify($.NSScreen.screens.js.map(s=>{const f=s.frame,i=s.safeAreaInsets,' +
  'l=s.auxiliaryTopLeftArea,r=s.auxiliaryTopRightArea;return {frame:[f.origin.x,f.origin.y,f.size.width,f.size.height],' +
  'top:i.top,left:[l.origin.x,l.origin.y,l.size.width,l.size.height],right:[r.origin.x,r.origin.y,r.size.width,r.size.height]}}))';

const rect = (a) => ({ x: a[0], y: a[1], width: a[2], height: a[3] });

/**
 * Convert the JXA output to Electron (top-left origin) rectangles.
 * @param {any[]} screens NSScreen.screens as returned by NSSCREEN_JXA; screens[0] is the main screen.
 * @returns {{ bounds: object, top: number, notch: object|null, leftArea: object|null, rightArea: object|null }[]}
 */
function fromNSScreens(screens) {
  if (!Array.isArray(screens) || !screens.length) return [];
  const mainHeight = screens[0].frame[3];
  // AppKit y counts up from the bottom of the main screen; Electron y counts down from its top.
  const flip = (r) => ({ x: r.x, y: mainHeight - (r.y + r.height), width: r.width, height: r.height });
  return screens.map((s) => {
    const bounds = flip(rect(s.frame));
    const left = rect(s.left),
      right = rect(s.right);
    const hasNotch = s.top > 0 && left.width > 0 && right.width > 0 && right.x > left.x + left.width;
    if (!hasNotch) return { bounds, top: s.top || 0, notch: null, leftArea: null, rightArea: null };
    const leftArea = flip(left),
      rightArea = flip(right);
    const notch = {
      x: leftArea.x + leftArea.width,
      y: leftArea.y,
      width: rightArea.x - (leftArea.x + leftArea.width),
      height: s.top,
    };
    return { bounds, top: s.top, notch, leftArea, rightArea };
  });
}

/**
 * Fallback when NSScreen is unavailable: the workArea heuristic. Misjudges when the menu bar auto-hides, and the
 * notch width is a guess (manual trim), so the result is marked as such.
 * @param {{ bounds: any, workArea: any }} display Electron display
 * @param {number} notchWidth manual value in points
 */
function fromHeuristic(display, notchWidth) {
  const top = display.workArea.y - display.bounds.y;
  if (!(top > 30)) return null;
  const x = Math.round(display.bounds.x + (display.bounds.width - notchWidth) / 2);
  return { bounds: display.bounds, top, notch: { x, y: display.bounds.y, width: notchWidth, height: top } };
}

/**
 * Island layout in screen coordinates. Ear content keeps `buffer` points away from the notch edge.
 * @param {{ notch: any, ear?: number, buffer?: number, earsVisible: boolean, panelWidth?: number, panelHeight?: number }} o
 */
function layout({ notch, ear = 72, buffer = 12, earsVisible, panelWidth = 470, panelHeight = 196 }) {
  const islandWidth = notch.width + (earsVisible ? ear * 2 : 0);
  const width = Math.max(islandWidth, panelWidth);
  const center = notch.x + notch.width / 2;
  const x = Math.round(center - width / 2);
  const win = { x, y: notch.y, width, height: notch.height + panelHeight };
  const islandX = Math.round(center - islandWidth / 2) - x;
  return {
    window: win,
    // Everything below is relative to the window.
    island: { x: islandX, y: 0, width: islandWidth, height: notch.height },
    notch: { x: notch.x - x, y: 0, width: notch.width, height: notch.height },
    leftEar: earsVisible ? { x: islandX, y: 0, width: ear - buffer, height: notch.height } : null,
    rightEar: earsVisible
      ? { x: notch.x - x + notch.width + buffer, y: 0, width: ear - buffer, height: notch.height }
      : null,
  };
}

module.exports = { NSSCREEN_JXA, fromNSScreens, fromHeuristic, layout };
