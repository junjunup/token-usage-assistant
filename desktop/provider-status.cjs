// Provider status pages (T14.3, D21 ③). Only while the user turned the setting on (off by default): every 5 minutes,
// the public status page of each connected platform that has one is asked for its overall indicator. The addresses
// are fixed here (never from a response or the user); requests are plain HTTPS GETs with no credentials, cookies or
// identity, no redirects, a short timeout and a size cap. The result is a hint next to the account; it never changes
// quota or balance figures, alert colours or the menu-bar icon. A failed check keeps the last result and its time.
// All four pages are Atlassian-Statuspage compatible (/api/v2/status.json); see docs/research/PROVIDER-STATUS.md.

/** @type {Readonly<Record<string, { name: string, page: string }>>} */
const PAGES = Object.freeze({
  claude: { name: 'Anthropic', page: 'https://status.claude.com' },
  codex: { name: 'OpenAI', page: 'https://status.openai.com' },
  kimi: { name: 'Moonshot', page: 'https://status.moonshot.cn' },
  minimax: { name: 'MiniMax', page: 'https://status.minimax.io' },
});
const INTERVAL_MS = 5 * 60 * 1000;
const MAX_BYTES = 64 * 1024;
/** @typedef {'none'|'minor'|'major'|'critical'|'maintenance'} Indicator */
const INDICATORS = ['none', 'minor', 'major', 'critical', 'maintenance'];

/**
 * The overall indicator of a Statuspage `status.json` body; anything else is an incompatible format.
 * @param {any} body
 * @returns {Indicator}
 */
function parseStatus(body) {
  const indicator = body?.status?.indicator;
  if (typeof indicator !== 'string' || !INDICATORS.includes(indicator)) throw new Error('format');
  return /** @type {Indicator} */ (indicator);
}

/**
 * What the account line says for an indicator.
 * @param {Indicator|null} indicator
 * @returns {{ text: string, tone: 'green'|'amber'|'red'|'neutral' }}
 */
function describe(indicator) {
  switch (indicator) {
    case 'none':
      return { text: '运行正常', tone: 'green' };
    case 'minor':
      return { text: '部分服务降级', tone: 'amber' };
    case 'major':
      return { text: '较大范围故障', tone: 'red' };
    case 'critical':
      return { text: '严重故障', tone: 'red' };
    case 'maintenance':
      return { text: '维护中', tone: 'neutral' };
    default:
      return { text: '—', tone: 'neutral' };
  }
}

/**
 * @typedef {{ indicator: Indicator|null, checkedAt: number|null, failing: boolean }} PageState
 *   checkedAt: the last successful check; failing: the latest check failed (the last result is kept)
 */

class ProviderStatus {
  /**
   * @param {{ fetch: (url: string, init: any) => Promise<any>, now?: () => number, intervalMs?: number,
   *   timeoutMs?: number, onChange?: () => void }} options
   */
  constructor({ fetch, now = Date.now, intervalMs = INTERVAL_MS, timeoutMs = 15000, onChange = () => {} }) {
    this.fetch = fetch;
    this.now = now;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.onChange = onChange;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this.timer = null;
    this.running = false;
    /** @type {Promise<void>|null} */
    this.pending = null;
    /** @type {string[]} */
    this.providers = [];
    /** @type {Map<string, PageState>} */
    this.pages = new Map();
  }
  /**
   * The connected platforms; only those with a known page are checked. A newly added one is checked right away.
   * @param {string[]} providers
   */
  setProviders(providers) {
    const next = [...new Set(providers.filter((p) => Object.hasOwn(PAGES, p)))].sort();
    const added = next.some((p) => !this.providers.includes(p));
    this.providers = next;
    for (const p of [...this.pages.keys()]) if (!next.includes(p)) this.pages.delete(p);
    if (added && this.running) this.check();
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.check();
  }
  /** Setting off: nothing is kept or shown. */
  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pages.clear();
    this.onChange();
  }
  /**
   * @param {string} provider
   * @returns {(PageState & { name: string }) | null} null when the setting is off or the platform has no page
   */
  state(provider) {
    if (!this.running || !Object.hasOwn(PAGES, provider)) return null;
    const page = this.pages.get(provider) || { indicator: null, checkedAt: null, failing: false };
    return { name: PAGES[provider].name, ...page };
  }
  /** @param {string} provider @returns {string|null} the fixed status page address */
  static page(provider) {
    return Object.hasOwn(PAGES, provider) ? PAGES[provider].page : null;
  }
  /** One check at a time: a call while one runs waits for it. */
  check() {
    if (!this.pending) this.pending = this.run().finally(() => (this.pending = null));
    return this.pending;
  }
  async run() {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    let changed = false;
    for (const provider of this.providers) {
      const previous = this.pages.get(provider) || { indicator: null, checkedAt: null, failing: false };
      let next;
      try {
        next = { indicator: await this.request(PAGES[provider].page), checkedAt: this.now(), failing: false };
      } catch {
        next = { ...previous, failing: true };
      }
      if (!this.running || !this.providers.includes(provider)) continue;
      this.pages.set(provider, next);
      changed = true;
    }
    if (changed) this.onChange();
    if (this.running) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.check(), this.intervalMs);
      this.timer.unref?.();
    }
  }
  /** @param {string} page @returns {Promise<Indicator>} */
  async request(page) {
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(page + '/api/v2/status.json', {
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('http');
      const text = await response.text();
      if (text.length > MAX_BYTES) throw new Error('size');
      return parseStatus(JSON.parse(text));
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = { ProviderStatus, PAGES, parseStatus, describe, INTERVAL_MS };
