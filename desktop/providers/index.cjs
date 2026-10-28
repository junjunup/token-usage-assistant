// Platform registry (T5.3a): one file per platform. The order is the order shown in the app; provider-catalog.cjs
// derives the renderer-safe metadata from it, providers.cjs the clients and main.cjs the official pages.
const REGISTRY = Object.freeze(
  [
    'opencode-go',
    'deepseek',
    'kimi',
    'openrouter',
    'codex',
    'claude',
    'commandcode',
    'glm',
    'minimax',
    'volcengine',
  ].map((id) => require('./' + id + '.cjs')),
);
const providerDefinition = (id) => REGISTRY.find((p) => p.id === id) || null;
module.exports = { REGISTRY, providerDefinition };
