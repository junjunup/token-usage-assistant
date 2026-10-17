// Menu-bar POC (T7.3), rendering option b: rasterise the brand ring in the main process without a renderer.
// Development only: this directory is excluded from packages (electron-builder.yml). Pure functions, tested.

// desktop/assets/brand-mark.svg (viewBox -32 -32 576 576, centre 256,256), even-odd fill.
const MARK =
  'M 238.484 33.501 C 145.771 44.168, 70.496 104.882, 41.971 192 C 29.841 229.048, 28.610 271.830, 38.540 311.301 C 47.761 347.954, 69.090 384.505, 97.700 412.683 C 158.303 472.371, 248.638 493.685, 327 466.785 C 410.968 437.962, 470.500 362.701, 479.101 274.500 C 480.774 257.340, 479.112 222.987, 476.610 223.011 C 476 223.016, 462 228.795, 445.500 235.852 L 415.500 248.682 414.815 260.991 C 413.639 282.119, 410.205 297.976, 402.962 315.725 C 382.925 364.820, 339.398 400.696, 286 412.128 C 271.829 415.162, 239.395 415.473, 225.500 412.709 C 158.431 399.367, 109.498 350.408, 96.357 283.500 C 93.431 268.605, 93.884 241.979, 97.342 225.621 C 108.734 171.720, 144.982 128.586, 195.609 108.687 C 220.378 98.951, 252.145 95.340, 278.287 99.288 C 284.433 100.217, 287.325 100.298, 287.909 99.558 C 290.590 96.160, 320.091 39.956, 319.605 39.171 C 318.900 38.029, 300.039 34.415, 287.500 33.019 C 275.602 31.694, 252.192 31.924, 238.484 33.501 M 339.579 82.643 C 330.435 98.947, 323.076 112.377, 323.227 112.487 C 323.377 112.597, 327.252 114.666, 331.839 117.083 C 364.402 134.251, 394.398 169.818, 406.493 205.603 L 409.231 213.707 412.866 211.966 C 414.865 211.008, 428.200 205.169, 442.500 198.990 C 456.800 192.811, 468.858 187.430, 469.296 187.032 C 470.414 186.015, 464.816 169.057, 459.072 156.065 C 443.723 121.341, 416.807 89.126, 385.490 67.993 C 376.738 62.088, 359.936 53, 357.769 53 C 356.759 53, 350.314 63.504, 339.579 82.643';
const VIEW = { x: -32, y: -32, size: 576 };
const CENTRE = 256;
// The fill starts at the top gap and runs clockwise (screen coordinates, degrees from +x).
const START = -84;

/** Flatten the M / L / C path into closed polygons. */
function flatten(d, steps = 16) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/gi) || [];
  const polys = [];
  let poly = null,
    cmd = null,
    i = 0,
    x = 0,
    y = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[MLCZ]$/i.test(tokens[i])) cmd = tokens[i++].toUpperCase();
    if (cmd === 'M') {
      x = num();
      y = num();
      poly = [[x, y]];
      polys.push(poly);
      cmd = 'L';
    } else if (cmd === 'L') {
      x = num();
      y = num();
      poly.push([x, y]);
    } else if (cmd === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      for (let k = 1; k <= steps; k++) {
        const t = k / steps,
          u = 1 - t;
        poly.push([
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else i++;
  }
  return polys;
}

const EDGES = flatten(MARK).flatMap((p) => p.map((a, k) => [a, p[(k + 1) % p.length]]));
/** Even-odd point-in-shape test in viewBox coordinates. */
function insideMark(px, py) {
  let inside = false;
  for (const [[x1, y1], [x2, y2]] of EDGES)
    if (y1 > py !== y2 > py && px < ((x2 - x1) * (py - y1)) / (y2 - y1) + x1) inside = !inside;
  return inside;
}

const masks = new Map();
/** Per-sample shape mask and angle for a square bitmap of `size` pixels, computed once per size. */
function mask(size, samples) {
  const key = size + ':' + samples;
  if (masks.has(key)) return masks.get(key);
  const n = size * size * samples * samples;
  const inside = new Uint8Array(n),
    angle = new Float32Array(n);
  let k = 0;
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++)
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++, k++) {
          const vx = VIEW.x + ((px + (sx + 0.5) / samples) / size) * VIEW.size,
            vy = VIEW.y + ((py + (sy + 0.5) / samples) / size) * VIEW.size;
          inside[k] = insideMark(vx, vy) ? 1 : 0;
          angle[k] = ((((Math.atan2(vy - CENTRE, vx - CENTRE) * 180) / Math.PI - START) % 360) + 360) % 360;
        }
  const value = { inside, angle };
  masks.set(key, value);
  return value;
}

/**
 * Rasterise the ring as premultiplied BGRA (the layout `nativeImage.createFromBitmap` takes on macOS).
 * @param {{ size: number, ratio: number|null, fill: number[], track: number[], samples?: number }} o
 *   ratio: remaining 0..1, or null when the ring is not a gauge (only the track is drawn).
 *   fill / track: [r, g, b, a] with a in 0..1.
 */
function rasterRing({ size, ratio, fill, track, samples = 4 }) {
  const { inside, angle } = mask(size, samples);
  const per = samples * samples,
    sweep = ratio === null ? 0 : Math.max(0, Math.min(1, ratio)) * 360;
  const out = Buffer.alloc(size * size * 4);
  for (let p = 0; p < size * size; p++) {
    let lit = 0,
      dim = 0;
    for (let s = p * per; s < (p + 1) * per; s++)
      if (inside[s]) {
        if (angle[s] < sweep) lit++;
        else dim++;
      }
    const a = (lit * fill[3] + dim * track[3]) / per;
    if (a <= 0) continue;
    // Premultiplied colour = sum of each sample's colour times its alpha.
    const c = (i) => (lit * fill[i] * fill[3] + dim * track[i] * track[3]) / per;
    out[p * 4] = Math.round(c(2));
    out[p * 4 + 1] = Math.round(c(1));
    out[p * 4 + 2] = Math.round(c(0));
    out[p * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

module.exports = { MARK, START, flatten, insideMark, rasterRing };
