// Island POC (T7.1) page: fixed sample values, hover state machine (150 ms dwell, 200 ms grace).
/* global document, window, setTimeout, clearTimeout */
const DWELL = 150;
const GRACE = 200;
const island = document.getElementById('island');
const panel = document.getElementById('panel');
const left = document.getElementById('left');
const right = document.getElementById('right');

const segments = (value, count) =>
  Array.from({ length: count }, (_, i) => `<i class="${i < Math.round((value / 100) * count) ? 'on' : ''}"></i>`).join(
    '',
  );
for (const bar of document.querySelectorAll('.bar')) bar.innerHTML = segments(Number(bar.dataset.value), 20);

const place = (el, r) => {
  if (!r) return (el.style.display = 'none');
  Object.assign(el.style, {
    display: '',
    left: r.x + 'px',
    top: r.y + 'px',
    width: r.width + 'px',
    height: r.height + 'px',
  });
};

let state = null;
window.islandPoc.onLayout((value) => {
  state = value;
  place(island, value.island);
  // Ear rectangles are relative to the window; inside the island they are offset by the island's x.
  const ear = (r) => r && { ...r, x: r.x - value.island.x };
  place(left, ear(value.leftEar));
  place(right, ear(value.rightEar));
  left.className = 'ear left' + (value.options.alert ? ' alert' : '');
  right.className = 'ear right';
  // ② while alerting the whole ear is replaced by the alert content.
  left.innerHTML = value.options.alert
    ? `<span class="tag">5H</span><span class="mini">${segments(8, 6)}</span><span>8%</span>`
    : `<span class="tag">5H</span><span class="mini">${segments(62, 6)}</span><span>62%</span>`;
  right.innerHTML = `<span class="tag">周</span><span>78%</span>`;
  place(panel, { x: (value.window.width - 470) / 2, y: value.island.height, width: 470, height: 184 });
  if (value.options.panel) open(true);
});

let dwell = null;
let grace = null;
let inside = false;
const open = (value) => {
  panel.classList.toggle('open', value);
  panel.setAttribute('aria-hidden', String(!value));
};
const within = (el, x, y) => {
  const r = el.getBoundingClientRect();
  return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
};
// With setIgnoreMouseEvents(true, {forward: true}) the page still receives mousemove for the whole window.
document.addEventListener('mousemove', (e) => {
  if (!state || state.options.panel) return;
  const over =
    within(island, e.clientX, e.clientY) || (panel.classList.contains('open') && within(panel, e.clientX, e.clientY));
  if (over === inside) return;
  inside = over;
  window.islandPoc.hover(over);
  clearTimeout(dwell);
  clearTimeout(grace);
  if (over) dwell = setTimeout(() => open(true), DWELL);
  else grace = setTimeout(() => open(false), GRACE);
});
document.addEventListener('mouseleave', () => {
  if (!state || state.options.panel || !inside) return;
  inside = false;
  window.islandPoc.hover(false);
  clearTimeout(dwell);
  grace = setTimeout(() => open(false), GRACE);
});
