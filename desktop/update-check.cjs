// Update check (T5.2): ask the public installer repository which versions exist and tell the user when a newer one
// is out. It only informs: never downloads or installs anything (no signing/notarization, D4). The repository is
// a constant (no user-configurable address); the request carries no identity or device information.
const { log } = require('./logger.cjs');

const REPOSITORY = 'junjunup/TokenUsageAssistant';
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`;
const PAGE_PREFIX = `https://github.com/${REPOSITORY}/releases/tag/`;
const DAY = 24 * 60 * 60 * 1000;
const MAX_BYTES = 2_000_000;

// x.y.z or x.y.z-beta.N (also -alpha.N / -rc.N). Anything else is ignored. A local development build adds
// -dev.<short commit> (D1) and compares as the version it was built from (T8.6), so it is told about newer releases.
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?(?:-dev\.[0-9a-f]{7,40})?$/;
const STAGES = { alpha: 0, beta: 1, rc: 2 };

/**
 * @param {string} value
 * @returns {number[]|null} [major, minor, patch, stage, n]; a final release sorts after its pre-releases.
 */
function parseVersion(value) {
  const m = VERSION.exec(typeof value === 'string' ? value.replace(/^v/, '') : '');
  if (!m) return null;
  const stage = m[4] ? STAGES[/** @type {'alpha'|'beta'|'rc'} */ (m[4])] : 3;
  return [Number(m[1]), Number(m[2]), Number(m[3]), stage, m[5] ? Number(m[5]) : 0];
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} >0 when a is newer than b; NaN when either is not a version.
 */
function compareVersions(a, b) {
  const x = parseVersion(a),
    y = parseVersion(b);
  if (!x || !y) return NaN;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * The newest published (non-draft) release with a valid version tag, from the GitHub releases list.
 * @param {any} releases
 * @returns {{ version: string, url: string } | null}
 */
function newestRelease(releases) {
  if (!Array.isArray(releases)) return null;
  let best = null;
  for (const r of releases) {
    if (!r || r.draft || typeof r.tag_name !== 'string' || !parseVersion(r.tag_name)) continue;
    const version = r.tag_name.replace(/^v/, '');
    if (!best || compareVersions(version, best.version) > 0)
      // The page is built from the constant repository, never taken from the response.
      best = { version, url: PAGE_PREFIX + encodeURIComponent(r.tag_name) };
  }
  return best;
}

class UpdateChecker {
  /**
   * @param {{ currentVersion: string, fetch: (url: string, init: any) => Promise<any>, now?: () => number,
   *   intervalMs?: number, timeoutMs?: number, onChange?: (state: any) => void }} options
   */
  constructor({ currentVersion, fetch, now = Date.now, intervalMs = DAY, timeoutMs = 15000, onChange = () => {} }) {
    Object.assign(this, { currentVersion, fetch, now, intervalMs, timeoutMs, onChange });
    /** @type {ReturnType<typeof setTimeout>|null} */
    this.timer = null;
    this.running = false;
    this.state = { status: 'idle', latest: null, checkedAt: null };
  }
  // Check now, then every intervalMs, until stop().
  start() {
    if (this.running) return;
    this.running = true;
    this.check();
  }
  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.state = { status: 'idle', latest: null, checkedAt: null };
    this.onChange(this.state);
  }
  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = this.running ? setTimeout(() => this.check(), this.intervalMs) : null;
    this.timer?.unref?.();
  }
  async check() {
    if (!this.running) return this.state;
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), this.timeoutMs),
      started = this.now();
    try {
      const response = await this.fetch(RELEASES_URL, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `TokenUsageAssistant/${this.currentVersion}` },
      });
      // Rate limits (403/429) and other failures are silent: the next cycle simply tries again.
      if (!response.ok) {
        log.info('update', 'http', { status: response.status, durationMs: this.now() - started });
        return this.state;
      }
      const body = await response.text();
      if (body.length > MAX_BYTES) throw new Error('size');
      const latest = newestRelease(JSON.parse(body));
      if (!this.running) return this.state;
      const newer = !!latest && compareVersions(latest.version, this.currentVersion) > 0;
      this.state = { status: newer ? 'available' : 'current', latest: newer ? latest : null, checkedAt: this.now() };
      log.info('update', 'checked', { status: newer ? 1 : 0, durationMs: this.now() - started });
      this.onChange(this.state);
    } catch {
      log.info('update', 'failed', { durationMs: this.now() - started });
    } finally {
      clearTimeout(timeout);
      this.schedule();
    }
    return this.state;
  }
}

module.exports = { UpdateChecker, compareVersions, parseVersion, newestRelease, REPOSITORY, RELEASES_URL, PAGE_PREFIX };
