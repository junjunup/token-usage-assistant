// @ts-check
// T21.1 (D28 ①): tidy a pasted key and say when it does not look like this platform's key. Pure; never blocks a
// connection (the platform's answer decides) and never logs or stores anything.

// Prefixes only where the platform documents them; other platforms get no format hint.
const PREFIX = Object.freeze(
  /** @type {Record<string, string>} */ ({ deepseek: 'sk-', openrouter: 'sk-or-', 'kimi-admin': 'sk-admin-' }),
);

/**
 * Remove what copying from a terminal, a config file or a request often carries along: quotes, "Bearer ",
 * "Authorization:", an environment assignment (DEEPSEEK_API_KEY=…) and any whitespace or line breaks.
 * @param {string} text
 * @returns {{ key: string, changed: boolean }}
 */
function cleanKey(text) {
  const original = String(text ?? '');
  let key = original.trim();
  key = key.replace(/^export\s+/, '');
  key = key.replace(/^[A-Z][A-Z0-9_]{0,63}\s*=\s*/, '');
  key = key.replace(/^authorization\s*:\s*/i, '');
  key = key.replace(/^bearer\s+/i, '');
  key = key.replace(/^(["'`])(.*)\1;?$/s, '$2');
  key = key.replace(/\s+/g, '');
  return { key, changed: key !== original };
}

/**
 * A hint when the key clearly belongs elsewhere, or null.
 * @param {string} provider
 * @param {string} key
 * @returns {string|null}
 */
function keyHint(provider, key) {
  if (!key) return null;
  if (provider === 'kimi' && key.startsWith('sk-admin-'))
    return '这是 Kimi 的 Admin Key，请选择「Kimi 开放平台 · 组织余额（Admin Key）」。';
  const prefix = PREFIX[provider];
  if (prefix && !key.startsWith(prefix)) return '这不像该平台的 Key：通常以 ' + prefix + ' 开头。';
  return null;
}

module.exports = { cleanKey, keyHint, PREFIX };
