import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const output = path.resolve('src/generated');
fs.mkdirSync(output, { recursive: true });
for (const name of [
  'domain',
  'association-rules',
  'balance-domain',
  'analytics-core',
  'analytics-fixture',
  'tool-analytics',
  'provider-domain',
  'provider-fixture',
]) {
  let code = fs.readFileSync(`desktop/${name}.cjs`, 'utf8');
  // Match the require lines regardless of formatting whitespace.
  code = code.replace(
    /const\s*\{\s*summarizeAssociations\s*\}\s*=\s*require\('\.\/association-rules\.cjs'\);/,
    "import {summarizeAssociations} from './association-rules.js';",
  );
  code = code.replace(
    /const\s*\{\s*count\s*\}\s*=\s*require\('\.\/domain\.cjs'\);/,
    "import {count} from './domain.js';",
  );
  code = code.replace(
    /const\s*\{\s*makeBins\s*,\s*priceKey\s*\}\s*=\s*require\('\.\/analytics-core\.cjs'\);/,
    "import {makeBins,priceKey} from './analytics-core.js';",
  );
  code = code.replace(
    /const\s*\{\s*count\s*,\s*finite\s*,\s*text\s*,\s*timestamp\s*\}\s*=\s*require\('\.\/domain\.cjs'\);/,
    "import { count, finite, text, timestamp } from './domain.js';",
  );
  if (/\brequire\(/.test(code)) throw new Error(`Unconverted require() in desktop/${name}.cjs`);
  code = code.replace(/module\.exports\s*=\s*\{([^}]+)\};?\s*$/, (_all, keys) => `export {${keys}};\n`);
  fs.writeFileSync(
    path.join(output, name + '.js'),
    '// Generated from desktop/' + name + '.cjs for the browser preview.\n' + code,
  );
}
// provider-catalog.cjs is derived from the platform registry (desktop/providers/, T5.3a), whose entries also hold
// main-only request code. The preview receives only the derived, renderer-safe metadata, serialized as JSON.
{
  const { PROVIDERS, providerInfo } = createRequire(import.meta.url)('../desktop/provider-catalog.cjs');
  fs.writeFileSync(
    path.join(output, 'provider-catalog.js'),
    '// Generated from desktop/provider-catalog.cjs (platform registry metadata) for the browser preview.\n' +
      `const PROVIDERS = Object.freeze(${JSON.stringify(PROVIDERS, null, 2)});\n` +
      providerInfo.toString() +
      '\nexport { PROVIDERS, providerInfo };\n',
  );
}
console.log('Prepared shared analytics preview modules.');
