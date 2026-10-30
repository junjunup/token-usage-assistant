// Menu-bar icon renderer (T7.5, macOS; T11.2 adds the Windows tray form). Runs in a hidden, sandboxed window without a
// preload; desktop/menubar-icon.cjs calls render(model) through executeJavaScript and turns the returned PNG into a
// nativeImage for the tray (macOS: one 2x image; Windows: one image per DPI scale).
// The ring is the approved brand mark: at 100% it is exactly the logo; the remaining share is lit clockwise from the
// top gap and the rest stays dim. Template images are drawn in black only (macOS tints them for the menu bar).
/* global document, MARK, Path2D */
const SCALE = 2;
const HEIGHT = 22; // points
const RING = 18; // points, same size as the static tray icon
const START = (-84 * Math.PI) / 180; // the top gap
// Tokens from src/styles.css (.app / .app.dark); only used for alerting (non-template) images.
const COLORS = {
  light: { fg: 'rgba(0,0,0,0.85)', track: 'rgba(0,0,0,0.28)', amber: '#ba7917', red: '#dc4c57' },
  dark: { fg: 'rgba(255,255,255,0.9)', track: 'rgba(255,255,255,0.28)', amber: '#e3ad57', red: '#ee7580' },
};
const FONT = '-apple-system, "PingFang SC", system-ui, sans-serif';
// T11.2 Windows tray (form 'tray'): the ring only, for light and dark taskbars.
const TRAY = {
  light: { fg: 'rgba(0,0,0,0.85)', track: 'rgba(0,0,0,0.26)', amber: '#ba7917', red: '#dc4c57' },
  dark: { fg: '#ffffff', track: 'rgba(255,255,255,0.3)', amber: '#e3ad57', red: '#ee7580' },
};

/**
 * @param {{ form: 'ring'|'value'|'two', ratio: number|null, text: string, tone: string,
 *   lines: { label: string, text: string, tone: string }[], template: boolean, dark: boolean }} m
 * @returns {{ dataURL: string, width: number, height: number }}
 */
// eslint-disable-next-line no-unused-vars
function render(m) {
  if (m.form === 'tray') return renderTray(m);
  const palette = m.template ? { fg: '#000', track: 'rgba(0,0,0,0.28)' } : COLORS[m.dark ? 'dark' : 'light'];
  const tint = (tone) => (!m.template && (tone === 'amber' || tone === 'red') ? palette[tone] : palette.fg);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const measure = (font, text) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
  const big = '13px ' + FONT,
    small = '9.5px ' + FONT;
  const lines = m.lines.slice(0, 2);
  let width = RING;
  if (m.form === 'value') width = RING + 4 + Math.ceil(measure(big, m.text));
  if (m.form === 'two')
    width = RING + 4 + Math.ceil(Math.max(...lines.map((l) => measure(small, l.label + ' ') + measure(small, l.text))));
  canvas.width = width * SCALE;
  canvas.height = HEIGHT * SCALE;
  ctx.scale(SCALE, SCALE);

  ctx.save();
  ctx.translate(0, (HEIGHT - RING) / 2);
  ctx.scale(RING / 576, RING / 576);
  ctx.translate(32, 32); // the mark's viewBox starts at -32
  const mark = new Path2D(MARK);
  ctx.fillStyle = palette.track;
  ctx.fill(mark, 'evenodd');
  if (typeof m.ratio === 'number' && m.ratio > 0) {
    ctx.clip(mark, 'evenodd');
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.arc(256, 256, 400, START, START + Math.min(1, m.ratio) * 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = tint(m.tone);
    ctx.fill();
  }
  ctx.restore();

  ctx.textBaseline = 'middle';
  if (m.form === 'value') {
    ctx.font = big;
    ctx.fillStyle = tint(m.tone);
    ctx.fillText(m.text, RING + 4, HEIGHT / 2 + 0.5);
  }
  if (m.form === 'two')
    lines.forEach((l, i) => {
      const y = lines.length === 1 ? HEIGHT / 2 : i === 0 ? 6 : 16.5;
      ctx.font = small;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = palette.fg;
      ctx.fillText(l.label, RING + 4, y);
      const offset = ctx.measureText(l.label + ' ').width;
      ctx.globalAlpha = 1;
      ctx.fillStyle = tint(l.tone);
      ctx.fillText(l.text, RING + 4 + offset, y);
    });
  return { dataURL: canvas.toDataURL('image/png'), width, height: HEIGHT };
}

/**
 * Windows tray icon (T11.2): the ring only, square, at one pixel size per DPI scale; no text, no template image.
 * The lit share is the tightest account's remaining share. At 16 px a thin lit share is hard to see, so an alert
 * also tints the whole track: below the threshold amber, exhausted all red; no data is the bare track.
 * @param {{ size: number, ratio: number|null, tone: string, dark: boolean, alertColor: boolean }} m
 */
function renderTray(m) {
  const p = TRAY[m.dark ? 'dark' : 'light'];
  const alert = m.alertColor && (m.tone === 'amber' || m.tone === 'red') ? m.tone : null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = m.size;
  const ctx = canvas.getContext('2d');
  ctx.scale(m.size / 576, m.size / 576);
  ctx.translate(32, 32);
  const mark = new Path2D(MARK);
  ctx.globalAlpha = alert === 'amber' ? 0.4 : 1;
  ctx.fillStyle = alert ? p[alert] : p.track;
  ctx.fill(mark, 'evenodd');
  ctx.globalAlpha = 1;
  if (typeof m.ratio === 'number' && m.ratio > 0) {
    ctx.clip(mark, 'evenodd');
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.arc(256, 256, 400, START, START + Math.min(1, m.ratio) * 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = alert ? p[alert] : p.fg;
    ctx.fill();
  }
  return { dataURL: canvas.toDataURL('image/png'), width: m.size, height: m.size };
}
