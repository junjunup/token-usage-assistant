const { readJson, atomicWrite } = require('./store.cjs');
const { DAY } = require('./analytics-core.cjs');
// T12.1: the quota windows of platforms other than Command Code, sampled as the used share of each window (percent)
// for the pace forecast. Only windows with a known reset time count: unlimited, not applicable and not started
// (resetAt=0) windows are left out, so no countdown is invented.
function windowRecord(data) {
  const t = data.updatedAt?.credits,
    windows = {};
  for (const w of data.parts?.credits?.windows || [])
    if (
      typeof w.id === 'string' &&
      w.applicable !== false &&
      !w.unlimited &&
      w.resetAt > 0 &&
      Number.isFinite(w.remainingPercent)
    )
      windows[w.id] = { used: 100 - w.remainingPercent, cap: 100, resetAt: w.resetAt, label: w.label, group: w.group };
  return t && Object.keys(windows).length ? { t, summary: null, credits: null, windows, creditAt: t } : null;
}
class HistoryStore {
  constructor(file) {
    this.file = file;
    this.hash = '';
    this.records = [];
  }
  configure(hash) {
    if (hash === this.hash) return;
    this.hash = hash;
    const saved = readJson(this.file, {});
    this.records =
      hash && saved.fingerprint === hash && Array.isArray(saved.records)
        ? saved.records.filter((r) => Number.isFinite(r.t))
        : [];
  }
  append(data) {
    if (!this.hash || !data.parts.summary || !data.updatedAt.summary) return;
    const s = data.parts.summary,
      c = data.parts.credits;
    this.add({
      t: data.updatedAt.summary,
      summary: {
        total: s.total,
        input: s.input,
        output: s.output,
        cost: s.cost,
        requests: s.requests,
        periodStart: s.periodStart,
      },
      credits: c ? { five: c.five, week: c.week, purchased: c.purchased, monthly: c.monthly, free: c.free } : null,
      creditAt: data.updatedAt.credits || null,
    });
  }
  appendWindows(data) {
    const record = windowRecord(data);
    if (this.hash && record) this.add(record);
  }
  // A later sample in the same minute replaces the earlier one; samples not newer than the last are ignored.
  add(record) {
    const t = record.t;
    if (this.records.at(-1)?.t >= t) return;
    if (this.records.at(-1) && Math.floor(this.records.at(-1).t / 60000) === Math.floor(t / 60000)) this.records.pop();
    this.records.push(record);
    this.records = this.records.filter((r) => r.t >= t - 31 * DAY).slice(-16000);
    atomicWrite(this.file, { version: 1, fingerprint: this.hash, records: this.records });
  }
  clear() {
    this.hash = '';
    this.records = [];
  }
}
module.exports = { HistoryStore, windowRecord };
