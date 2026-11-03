// The runtime dependencies electron-builder puts into app.asar (T12.8: electron-updater and what it needs): the
// closure of package.json "dependencies", resolved the way Node does from each package's real (pnpm) folder.
// Used by verify-package.cjs (every packaged node_modules file must come from one of these) and by
// third-party-licenses.mjs (their license texts ship with the app).
const fs = require('node:fs');
const path = require('node:path');

/** @returns {Map<string, { name: string, version: string, license: string, dir: string }>} sorted by name */
function productionPackages(root) {
  const found = new Map();
  // Optional peers (debug -> supports-color) are followed only when pnpm installed them next to the package.
  const visit = (name, fromDir, optional = false) => {
    let dir;
    for (let at = fromDir; ; at = path.dirname(at)) {
      const candidate = path.join(at, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        dir = fs.realpathSync(candidate);
        break;
      }
      if (optional) return;
      if (path.dirname(at) === at) throw new Error('dependency not installed: ' + name);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const seen = found.get(name);
    if (seen) {
      if (seen.dir !== dir) throw new Error(`two versions of ${name} (${seen.version}, ${pkg.version})`);
      return;
    }
    found.set(name, { name, version: pkg.version, license: pkg.license, dir });
    // A package's own dependencies resolve from the folder that holds it (pnpm keeps them as siblings).
    const holder = name.startsWith('@') ? path.resolve(dir, '..', '..', '..') : path.resolve(dir, '..', '..');
    for (const dep of Object.keys(pkg.dependencies || {})) visit(dep, holder);
    for (const dep of Object.keys(pkg.peerDependencies || {})) visit(dep, holder, true);
  };
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const dep of Object.keys(rootPkg.dependencies || {})) visit(dep, root);
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)));
}

/** The package an asar path like node_modules/a/node_modules/@s/b/lib/x.js belongs to, and the rest of the path. */
function packageOf(file) {
  const parts = file.split('/');
  let name = null,
    rest = 0;
  for (let i = 0; i < parts.length - 1; i++)
    if (parts[i] === 'node_modules') {
      name = parts[i + 1].startsWith('@') ? parts[i + 1] + '/' + parts[i + 2] : parts[i + 1];
      rest = i + 1 + name.split('/').length;
    }
  return name ? { name, rest: parts.slice(rest).join('/') } : null;
}

module.exports = { productionPackages, packageOf };
