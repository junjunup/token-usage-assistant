// Diagnostics export (T3.3): a whitelist-only JSON snapshot the user previews in the app before saving.
// Never includes account labels, organisation ids, keys, file paths, error messages or conversation content;
// only enums, counts, timestamps and short identifier codes. Log lines are re-sanitized by the logger.
const { DEFAULT_SETTINGS } = require('./domain.cjs');

const CODE = /^[A-Za-z0-9_.:-]{1,48}$/;
const code = (value) => (typeof value === 'string' && CODE.test(value) ? value : value ? 'other' : null);
const time = (value) => (Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null);
const count = (value) => (Number.isFinite(value) && value >= 0 ? value : null);

function settingsSnapshot(settings = {}) {
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS))
    result[key] = typeof settings[key] === typeof fallback ? settings[key] : null;
  return result;
}

// accounts: [{ provider, region, active, monitor: { status, updatedAt, errors } }]
function accountSnapshot({ provider, region, active, monitor }) {
  const updated = Object.values(monitor?.updatedAt || {}).filter((v) => Number.isFinite(v) && v > 0);
  const error = (monitor?.errors || [])[0];
  return {
    provider: code(provider),
    region: code(region),
    active: !!active,
    status: code(monitor?.status) || 'unknown',
    lastSuccessAt: updated.length ? time(Math.max(...updated)) : null,
    lastError: error ? { code: code(error.code) || 'other', status: count(error.status) } : null,
  };
}

// sources: tool-sources list() items; only kind / enabled / status / lastSuccessAt / scannedRows are read.
function sourceSnapshot(source) {
  return {
    kind: code(source.kind),
    enabled: source.enabled !== false,
    status: code(source.status) || 'unknown',
    lastSuccessAt: time(source.lastSuccessAt),
    scannedRows: count(source.scannedRows),
  };
}

function buildDiagnostics({ app, system, settings, credentialIssue, accounts = [], sources = [], logLines = [], now }) {
  return {
    schema: 1,
    generatedAt: new Date(now()).toISOString(),
    app: {
      version: String(app.version),
      packaged: !!app.packaged,
      electron: String(app.electron || ''),
      chrome: String(app.chrome || ''),
      node: String(app.node || ''),
    },
    system: { platform: system.platform, arch: system.arch, release: String(system.release || '') },
    settings: settingsSnapshot(settings),
    credentialIssue: !!credentialIssue,
    accounts: accounts.map(accountSnapshot),
    toolSources: sources.map(sourceSnapshot),
    log: { lines: logLines.length, entries: logLines.map((line) => JSON.parse(line)) },
  };
}

module.exports = { buildDiagnostics };
