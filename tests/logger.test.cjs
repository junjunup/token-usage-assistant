const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Logger, log } = require('../desktop/logger.cjs');

const tempDir = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-logger-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'logs');
};
const lines = (dir, name = 'app.log') =>
  fs
    .readFileSync(path.join(dir, name), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

test('logger writes JSON lines with only whitelisted extra fields', (t) => {
  const dir = tempDir(t),
    logger = new Logger().configure({ dir, now: () => 0 });
  logger.warn('providers', 'http', {
    provider: 'glm',
    status: 401,
    durationMs: 12,
    message: 'upstream said something private',
    stack: 'Error: x\n at y',
    url: 'https://api.example.com/?key=abc',
    label: 'My personal account',
    apiKey: 'should-never-appear',
  });
  logger.flushSync();
  const [line] = lines(dir);
  assert.deepEqual(line, {
    t: '1970-01-01T00:00:00.000Z',
    level: 'warn',
    module: 'providers',
    code: 'http',
    status: 401,
    provider: 'glm',
    durationMs: 12,
  });
});

test('logger redacts secrets, tokens, long hex/base64 and paths in every string', (t) => {
  const dir = tempDir(t),
    logger = new Logger().configure({ dir });
  logger.error('codex-rpc', 'sk-abcdefghijklmnop', {
    stage: 'Bearer abc.def.ghi',
    errno: 'a'.repeat(40),
    version: 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0NTY3ODk=',
    kind: '/Users/someone/Library/secret.sqlite',
    provider: 'C:\\Users\\someone\\data.db',
  });
  logger.info('not a valid identifier!', 'ok');
  logger.flushSync();
  const raw = fs.readFileSync(path.join(dir, 'app.log'), 'utf8');
  for (const secret of ['sk-abcdefghijklmnop', 'abc.def.ghi', 'a'.repeat(40), 'QUJDREVG', 'someone'])
    assert.ok(!raw.includes(secret), 'leaked ' + secret);
  const [first, second] = lines(dir);
  assert.equal(first.code, '[redacted]');
  assert.equal(first.kind, '[path]');
  assert.equal(first.provider, '[path]');
  assert.equal(second.module, 'other');
});

test('logger rotates at the size limit and keeps three files', (t) => {
  const dir = tempDir(t),
    logger = new Logger().configure({ dir, maxBytes: 300 });
  for (let i = 0; i < 40; i++) {
    logger.info('rotation', 'line', { count: i });
    logger.flushSync();
  }
  const files = fs.readdirSync(dir).sort();
  assert.deepEqual(files, ['app.log', 'app.log.1', 'app.log.2']);
  for (const name of files) {
    assert.ok(fs.statSync(path.join(dir, name)).size <= 300);
    lines(dir, name); // every line in every file is valid JSON
  }
  assert.equal(lines(dir).at(-1).count, 39);
});

test('logger buffers and flushes asynchronously', async (t) => {
  const dir = tempDir(t),
    logger = new Logger().configure({ dir, delayMs: 5 });
  logger.info('buffer', 'a');
  logger.info('buffer', 'b');
  assert.ok(!fs.existsSync(path.join(dir, 'app.log')));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(
    lines(dir).map((l) => l.code),
    ['a', 'b'],
  );
});

test('logging never throws: unconfigured, unwritable directory and failing file system', (t) => {
  assert.doesNotThrow(() => log.info('test', 'unconfigured-is-noop'));
  const file = path.join(path.dirname(tempDir(t)), 'not-a-directory');
  fs.writeFileSync(file, 'x');
  const blocked = new Logger().configure({ dir: path.join(file, 'logs') });
  assert.equal(blocked.dir, null);
  assert.doesNotThrow(() => blocked.error('test', 'blocked'));
  const broken = {
    mkdirSync() {},
    statSync() {
      throw new Error('stat');
    },
    renameSync() {
      throw new Error('rename');
    },
    appendFileSync() {
      throw new Error('append');
    },
    promises: {
      appendFile: async () => {
        throw new Error('append');
      },
    },
  };
  const failing = new Logger().configure({ dir: tempDir(t), fileSystem: broken });
  assert.doesNotThrow(() => {
    failing.warn('test', 'write-fails', { count: 1 });
    failing.flushSync();
  });
  return failing.flush();
});
