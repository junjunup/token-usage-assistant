// Safe metadata shared with the renderer, derived from the platform registry (desktop/providers/, T5.3a).
// Credentials, request signing and normalization stay in main. The browser preview gets this list as JSON
// (scripts/prepare-analytics-preview.mjs), so only plain data is exposed here.
const { REGISTRY } = require('./providers/index.cjs');
const PROVIDERS = Object.freeze(
  REGISTRY.map(({ id, capabilities, name, regions, credential, note, verification }) => ({
    id,
    capabilities,
    name,
    regions,
    credential,
    note,
    verification,
  })),
);
function providerInfo(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}
module.exports = { PROVIDERS, providerInfo };
