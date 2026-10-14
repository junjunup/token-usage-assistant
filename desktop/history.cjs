const { readJson, atomicWrite } = require('./store.cjs');
const { DAY } = require('./analytics-core.cjs');
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
    const t = data.updatedAt.summary;
    if (this.records.at(-1)?.t >= t) return;
    const s = data.parts.summary,
      c = data.parts.credits;
    if (this.records.at(-1) && Math.floor(this.records.at(-1).t / 60000) === Math.floor(t / 60000)) this.records.pop();
    this.records.push({
      t,
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
    this.records = this.records.filter((r) => r.t >= t - 31 * DAY).slice(-16000);
    atomicWrite(this.file, { version: 1, fingerprint: this.hash, records: this.records });
  }
  clear() {
    this.hash = '';
    this.records = [];
  }
}
module.exports = { HistoryStore };
