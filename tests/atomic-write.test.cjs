const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { atomicWrite } = require('../desktop/store.cjs');

const temp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-atomic-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
// Replace fs.renameSync for one test; atomicWrite calls it through the shared fs module.
const patchRename = (t, impl) => {
  const original = fs.renameSync,
    calls = [];
  fs.renameSync = (from, to) => {
    calls.push([from, to]);
    return impl(calls.length, original, from, to);
  };
  t.after(() => (fs.renameSync = original));
  return calls;
};
const fail = (code) => Object.assign(new Error(code), { code });

test('atomicWrite writes JSON through a unique temp file and leaves nothing behind', (t) => {
  const dir = temp(t),
    file = path.join(dir, 'nested', 'settings.json');
  const calls = patchRename(t, (n, original, from, to) => original(from, to));
  atomicWrite(file, { a: 1 });
  atomicWrite(file, { a: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 2 });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['settings.json']);
  const [first, second] = calls.map(([from]) => path.basename(from));
  assert.match(first, new RegExp(`^settings\\.json\\.${process.pid}\\.[0-9a-f]{12}\\.tmp$`));
  assert.notEqual(first, second, 'every write uses its own temp name');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('a locked target is retried: EPERM twice, then the rename succeeds', (t) => {
  const dir = temp(t),
    file = path.join(dir, 'snapshot.json');
  fs.writeFileSync(file, '{"old":true}');
  const calls = patchRename(t, (n, original, from, to) => {
    if (n <= 2) throw fail('EPERM');
    return original(from, to);
  });
  const started = Date.now();
  atomicWrite(file, { fresh: true });
  assert.equal(calls.length, 3);
  assert.ok(Date.now() - started >= 90, 'backs off between attempts');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { fresh: true });
  assert.deepEqual(fs.readdirSync(dir), ['snapshot.json']);
});

test('a target that stays locked fails after 5 retries, removes the temp file and keeps the original', (t) => {
  const dir = temp(t),
    file = path.join(dir, 'accounts.encrypted.json');
  fs.writeFileSync(file, '{"old":true}');
  const calls = patchRename(t, () => {
    throw fail('EBUSY');
  });
  assert.throws(() => atomicWrite(file, { fresh: true }), { code: 'EBUSY' });
  assert.equal(calls.length, 6, 'one attempt plus 5 retries');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"old":true}');
  assert.deepEqual(fs.readdirSync(dir), ['accounts.encrypted.json']);
});

test('other rename errors are not retried and still clean up', (t) => {
  const dir = temp(t),
    file = path.join(dir, 'x.json');
  const calls = patchRename(t, () => {
    throw fail('EXDEV');
  });
  assert.throws(() => atomicWrite(file, { a: 1 }), { code: 'EXDEV' });
  assert.equal(calls.length, 1);
  assert.deepEqual(fs.readdirSync(dir), []);
});
