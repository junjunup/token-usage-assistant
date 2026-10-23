// Print the CHANGELOG.md section of one version (its bullet list, without the heading) for the public release
// notes (T8.10). Exits 1 when the version has no section, so a release is never published without its notes.
//   node scripts/changelog-section.cjs 1.9.0-beta.3
const fs = require('node:fs');
const path = require('node:path');

function section(text, version) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = lines.findIndex((l) => new RegExp('^## ' + escaped + '(（|\\(|\\s|$)').test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
  return body || null;
}

if (require.main === module) {
  const version = process.argv[2];
  const body = version && section(fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'), version);
  if (!body) {
    console.error(`CHANGELOG.md has no section for ${version || '(no version given)'}`);
    process.exit(1);
  }
  process.stdout.write(body + '\n');
}
module.exports = { section };
