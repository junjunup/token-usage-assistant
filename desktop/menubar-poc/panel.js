// Menu-bar POC (T7.3) panel page: fixed sample values; the theme comes from the query string.
/* global document, location, URLSearchParams */
if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.classList.add('dark');
for (const el of document.querySelectorAll('.segments')) {
  const on = Math.round((Number(el.dataset.value) / 100) * 20);
  el.innerHTML = Array.from({ length: 20 }, (_, i) => `<span class="${i < on ? 'on' : ''}"></span>`).join('');
}
