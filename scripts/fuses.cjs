// T9.2: the Electron fuse settings the packages must carry (electron-builder.yml `electronFuses`), read back from a
// built app. Used by scripts/verify-package.cjs (Windows) and scripts/Verify-Mac-Native.command (macOS).
//   node scripts/fuses.cjs <path to .app or .exe>   -> prints the fuse states as JSON, exits 1 on any mismatch
const path = require('node:path');
const { createRequire } = require('node:module');

/** Expected state per fuse; fuses not listed keep Electron's default and are reported but not enforced. */
const EXPECTED = Object.freeze({
  RunAsNode: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  OnlyLoadAppFromAsar: true,
  GrantFileProtocolExtraPrivileges: true,
});

/** @electron/fuses is a dependency of electron-builder, not of this project; resolve it through that chain. */
function fusesModule() {
  const builder = createRequire(require.resolve('electron-builder/package.json'));
  return createRequire(builder.resolve('app-builder-lib/package.json'))('@electron/fuses');
}

/** @param {string} target the .app bundle (macOS) or the executable (Windows) */
async function readFuses(target) {
  const { getCurrentFuseWire, FuseV1Options } = fusesModule();
  const wire = await getCurrentFuseWire(path.resolve(target));
  /** @type {Record<string, boolean|null>} */
  const states = {};
  for (const [key, value] of Object.entries(wire)) {
    const name = FuseV1Options[/** @type {any} */ (key)];
    if (typeof name !== 'string') continue;
    // The wire stores ASCII '1' (enabled) / '0' (disabled); anything else (e.g. 'r', removed) is unknown.
    states[name] = value === 49 ? true : value === 48 ? false : null;
  }
  return states;
}

/** @param {Record<string, boolean|null>} states @returns {string[]} the fuses that differ from EXPECTED */
function mismatches(states) {
  return Object.entries(EXPECTED)
    .filter(([name, want]) => states[name] !== want)
    .map(([name, want]) => `${name}=${states[name]}（应为 ${want}）`);
}

if (require.main === module) {
  readFuses(process.argv[2])
    .then((states) => {
      const wrong = mismatches(states);
      console.log(JSON.stringify({ ok: !wrong.length, states, mismatches: wrong }));
      process.exit(wrong.length ? 1 : 0);
    })
    .catch(() => {
      console.log(JSON.stringify({ ok: false, states: null, mismatches: ['无法读取 fuse'] }));
      process.exit(1);
    });
}
module.exports = { EXPECTED, readFuses, mismatches };
