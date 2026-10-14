import fs from 'node:fs';
import path from 'node:path';
const output = path.resolve('src/generated');
fs.mkdirSync(output, { recursive: true });
for (const name of [
  'domain',
  'association-rules',
  'balance-domain',
  'analytics-core',
  'analytics-fixture',
  'tool-analytics',
  'provider-catalog',
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
console.log('Prepared shared analytics preview modules.');
