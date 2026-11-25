// Safe metadata shared with the renderer, derived from the platform registry (desktop/providers/, T5.3a).
// Credentials, request signing and normalization stay in main. The browser preview gets this list as JSON
// (scripts/prepare-analytics-preview.mjs), so only plain data is exposed here.
const { REGISTRY } = require('./providers/index.cjs');
const { ENDPOINTS } = require('./domain.cjs');
const { ORIGIN } = require('./api.cjs');

const REPOSITORY = 'https://github.com/junjunup/token-usage-assistant/blob/main/';
// Placeholders only: the address and method do not depend on the credential (signatures and headers are not shown).
const SAMPLE = Object.freeze({ apiKey: 'key', accessKeyId: 'sample-access-key', secretKey: 'sample-secret-key' });

/**
 * T21.1 (D28 ①): what the connection form says about a platform's credential — the addresses it calls, generated
 * from the same code that sends the requests (so the form cannot drift from reality); the source file; the
 * platform's own key page per region (only where its official docs give one).
 * @param {any} p registry entry
 */
function access(p) {
  if (p.credential === 'local') return null;
  /** @type {Record<string, string[]>} */
  const reads = {};
  for (const r of p.regions)
    reads[r.id] =
      p.clientKind === 'commandcode'
        ? Object.values(ENDPOINTS).map((path) => 'GET ' + new URL(path, ORIGIN).toString())
        : [(({ method, url }) => method + ' ' + url)(p.buildRequest(SAMPLE, r.id, 0))];
  return {
    reads,
    source: REPOSITORY + (p.source || 'desktop/providers/' + p.id + '.cjs'),
    keysUrl: { ...(p.keysUrl || {}) },
  };
}

const PROVIDERS = Object.freeze(
  REGISTRY.map((p) => {
    const { id, capabilities, name, regions, credential, note, verification } = p;
    return { id, capabilities, name, regions, credential, note, verification, access: access(p) };
  }),
);
function providerInfo(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}
module.exports = { PROVIDERS, providerInfo };
