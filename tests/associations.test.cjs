const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { Associations } = require('../desktop/associations.cjs');
const { associateRows, compareEvidence } = require('../desktop/association-rules.cjs');
const { ToolSources } = require('../desktop/tool-sources.cjs');
const { LocalStore } = require('../desktop/store.cjs');
const { createZcode, createHarness, harnessWire } = require('../desktop/tool-fixture.cjs');
const now = new Date(2026, 8, 24, 12).getTime();
function setup(t) {
  const root = path.resolve(__dirname, '../work/association-tests');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'case-')),
    store = new LocalStore(dir, {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s),
      decryptString: (b) => b.toString(),
    });
  const file = createZcode(path.join(dir, 'z.sqlite'), now),
    tools = new ToolSources({ store, legacyFile: file, now: () => now });
  const accounts = { entries: [], runtimes: new Map(), settings: { refreshSeconds: 60 }, activeId: 'a' };
  function entry(id = 'a', patch = {}) {
    const e = {
      id,
      label: 'Synthetic ' + id,
      provider: 'commandcode',
      region: 'global',
      orgId: '',
      credential: { apiKey: 'PRIVATE_KEY_' + id },
      ...patch,
    };
    const data = {
      status: 'connected',
      parts: {
        identity: { accountId: 'same-account', scope: 'personal' },
        summary: { total: 120, requests: 1, cost: 0.01, periodStart: now - 86400000, periodEnd: null },
        subscription: { start: now - 86400000, end: now + 86400000, active: true },
      },
      updatedAt: { summary: now, subscription: now },
      errors: [],
    };
    accounts.entries.push(e);
    accounts.runtimes.set(id, { entry: e, monitor: { state: data, snapshot: () => structuredClone(data) } });
    return { e, data };
  }
  entry();
  entry('b');
  const links = new Associations({ store, accounts, tools, now: () => now });
  tools.associations = links;
  t.after(async () => {
    await tools.dispose();
    assert.ok(dir.startsWith(root + path.sep));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const group = (patch = {}) =>
      links.saveGroup({ label: 'My account', memberIds: ['a', 'b'], primaryId: 'a', confirmed: true, ...patch }),
    rule = (groupId, patch = {}) =>
      links.saveRule({
        sourceId: 'legacy-zcode',
        groupId,
        from: now - 3600000,
        to: null,
        provider: '',
        model: '',
        confirmed: true,
        ...patch,
      });
  return { dir, store, file, tools, accounts, links, group, rule, entry };
}

test('manual group confirmation, membership boundaries and one-group-per-connection are enforced', (t) => {
  const s = setup(t);
  assert.throws(() => s.group({ confirmed: false }), /确认/);
  assert.throws(() => s.group({ memberIds: ['a', 'a'] }), /一次/);
  assert.throws(() => s.group({ primaryId: 'none' }), /组内/);
  const id = s.group();
  assert.throws(() => s.group(), /另一/);
  assert.equal(s.links.publicState().groups[0].memberIds.length, 2);
  s.links.removeGroup(id);
  assert.equal(s.links.groups.length, 0);
});
test('different provider, region, org and known platform identities cannot be grouped', (t) => {
  const s = setup(t),
    b = s.accounts.entries[1];
  for (const [key, value] of [
    ['provider', 'deepseek'],
    ['region', 'cn'],
    ['orgId', 'another'],
  ]) {
    const old = b[key];
    b[key] = value;
    assert.throws(() => s.group(), /同平台/);
    b[key] = old;
  }
  s.accounts.runtimes.get('b').monitor.state.parts.identity.accountId = 'other';
  assert.throws(() => s.group(), /身份不同/);
});
test('singleton known account identity changes invalidate existing rules', (t) => {
  const s = setup(t),
    g = s.group({ memberIds: ['a'] });
  s.rule(g);
  s.accounts.runtimes.get('a').monitor.state.parts.identity.accountId = 'changed';
  assert.equal(s.links.publicState().groups[0].valid, false);
  assert.equal(s.links.publicState().rules[0].valid, false);
});
test('rename/primary switch preserve association; membership or key changes require reconfirmation', (t) => {
  const s = setup(t),
    g = s.group();
  s.rule(g);
  s.group({ id: g, label: 'renamed', primaryId: 'b' });
  assert.equal(s.links.publicState().rules[0].valid, true);
  s.accounts.entries[0].credential.apiKey = 'PRIVATE_NEW_KEY';
  assert.equal(s.links.publicState().groups[0].valid, false);
  s.group({ id: g });
  assert.equal(s.links.publicState().groups[0].valid, true);
  assert.equal(s.links.publicState().rules[0].valid, false);
  const r = s.links.rules[0];
  s.rule(g, { id: r.id });
  assert.equal(s.links.publicState().rules[0].valid, true);
  s.group({ id: g, memberIds: ['a'] });
  assert.equal(s.links.publicState().rules[0].valid, false);
});
test('removed members invalidate groups without silently reassigning records', (t) => {
  const s = setup(t),
    g = s.group();
  s.rule(g);
  s.accounts.entries = s.accounts.entries.filter((e) => e.id !== 'b');
  assert.equal(s.links.publicState().groups[0].valid, false);
});
test('renamed or moved source preserves physical identity; replaced file requires confirmation', (t) => {
  const s = setup(t),
    g = s.group();
  s.rule(g);
  s.tools.update('legacy-zcode', { label: 'new name' });
  assert.equal(s.links.publicState().rules[0].valid, true);
  const moved = s.file + '.moved';
  fs.renameSync(s.file, moved);
  s.tools.relocate('legacy-zcode', moved);
  assert.equal(s.links.publicState().rules[0].valid, true);
  const replacement = createZcode(s.file, now);
  s.tools.relocate('legacy-zcode', replacement);
  assert.equal(s.links.publicState().rules[0].valid, false);
});
test('rules require explicit scope and reject overlap including wildcard intersections', (t) => {
  const s = setup(t),
    g = s.group();
  assert.throws(() => s.rule(g, { confirmed: false }), /确认/);
  assert.throws(() => s.rule(g, { to: now - 3600001 }), /时间/);
  s.rule(g, { from: now - 5000, to: now, model: 'model-a' });
  s.rule(g, { from: now - 5000, to: now, model: 'model-b' });
  assert.throws(() => s.rule(g, { from: now - 4000 }), /重叠/);
  s.rule(g, { from: now, model: 'model-a' });
  assert.equal(s.links.rules.length, 3);
});
test('effective interval is inclusive/exclusive; provider/model must match exactly', () => {
  const r = { id: 'r', sourceId: 's', groupId: 'g', from: 10, to: 20, provider: 'p', model: 'm', valid: true };
  const row = (at, patch = {}) => ({ sourceId: 's', at, provider: 'p', model: 'm', ...patch });
  const rows = associateRows(
    [row(9), row(10), row(19), row(20), row(15, { model: 'M' }), row(15, { provider: 'q' })],
    [r],
  );
  assert.deepEqual(
    rows.map((r) => r.accountId),
    [null, 'g', 'g', null, null, null],
  );
});
test('ambiguous or invalid stored rules never attribute records', () => {
  const row = { sourceId: 's', at: 10 },
    r = { id: 'r', sourceId: 's', groupId: 'a', from: 0, to: null, valid: true };
  assert.equal(associateRows([row], [r, { ...r, id: 'b', groupId: 'b' }])[0].association.status, 'ambiguous');
  assert.equal(associateRows([row], [r, { ...r, id: 'b', valid: false }])[0].accountId, null);
});
test('dual sources filter exact groups, unlinked rows and model/project/session consistently without mutation', async (t) => {
  const s = setup(t),
    h = s.tools.add({ kind: 'harness', file: createHarness(path.join(s.dir, 'h'), [harnessWire(now)]) }),
    g = s.group();
  s.rule(g);
  const before = fs.readFileSync(s.file);
  let r = await s.tools.query({ range: 'today' });
  assert.equal(r.summary.total, 240);
  assert.equal(r.association.linkedRecords, 1);
  assert.equal(r.association.unlinkedRecords, 1);
  assert.equal(r.accountId, null);
  r = await s.tools.query({ range: 'today', billingGroupId: g });
  assert.equal(r.summary.total, 120);
  assert.equal(r.sourceReports.length, 1);
  assert.equal(r.accountId, g);
  assert.equal(r.credits, null);
  for (let i = 0; i < 2; i++) {
    s.accounts.activeId = i ? 'b' : 'unrelated';
    const again = await s.tools.query({
      range: 'today',
      billingGroupId: g,
      model: r.models[0].id,
      project: r.projects[0].id,
      session: r.sessions[0].id,
    });
    assert.equal(again.summary.total, 120);
  }
  r = await s.tools.query({ range: 'today', billingGroupId: 'unlinked' });
  assert.equal(r.summary.total, 120);
  assert.equal(r.sessions[0].sourceId, h.id);
  assert.deepEqual(fs.readFileSync(s.file), before);
});
test('no implicit history association; billing range requires explicit valid group period', async (t) => {
  const s = setup(t),
    g = s.group();
  s.rule(g, { from: now });
  assert.equal((await s.tools.query({ range: 'today', billingGroupId: g })).summary.requests, 0);
  assert.equal((await s.tools.query({ range: 'billing' })).status, 'unavailable');
  assert.equal((await s.tools.query({ range: 'billing', billingGroupId: g })).range.start, now - 86400000);
  s.accounts.runtimes.get('a').monitor.state.updatedAt.subscription = now - 200000;
  assert.equal((await s.tools.query({ range: 'billing', billingGroupId: g })).status, 'unavailable');
});
test('disabled/unrelated sources are excluded from group reports and no-rule group is unavailable', async (t) => {
  const s = setup(t),
    g = s.group();
  assert.equal((await s.tools.query({ billingGroupId: g })).summary, null);
  s.rule(g);
  s.tools.update('legacy-zcode', { enabled: false });
  assert.equal((await s.tools.query({ billingGroupId: g })).status, 'unconfigured');
});
test('reconciliation uses one chosen Key, never sums shared balances or tool totals', async (t) => {
  const s = setup(t);
  for (const e of s.accounts.entries) {
    e.provider = 'deepseek';
    const d = s.accounts.runtimes.get(e.id).monitor.state;
    d.parts = { balance: { isAvailable: true, balances: [{ currency: 'CNY', total: e.id === 'a' ? '10' : '900' }] } };
    d.updatedAt = { balance: now };
  }
  const g = s.group();
  s.rule(g);
  const r = await s.links.reconcile({ groupId: g, range: 'today' }, {});
  assert.equal(r.platform.balance.balances[0].total, '10');
  assert.equal(r.tools.summary.total, 120);
  assert.equal(r.sumOfPlatformAndTools, null);
  assert.equal(r.available, false);
  assert.equal(r.errorRate, null);
  assert.ok(r.reasons.some((x) => x.includes('余额')));
  s.group({ id: g, primaryId: 'b' });
  assert.equal((await s.links.reconcile({ groupId: g }, {})).platform.balance.balances[0].total, '900');
});
test('quota and unmatched summary/coverage explain unavailable reconciliation', async (t) => {
  const s = setup(t),
    g = s.group();
  s.rule(g);
  let r = await s.links.reconcile({ groupId: g }, {});
  assert.ok(r.reasons.some((v) => v.includes('起止时间')));
  assert.ok(r.reasons.some((v) => v.includes('完整用量')));
  assert.equal(r.difference, null);
  const d = s.accounts.runtimes.get('a').monitor.state;
  delete d.parts.summary;
  d.parts.credits = { windows: [] };
  r = await s.links.reconcile({ groupId: g }, {});
  assert.ok(r.reasons.some((v) => v.includes('额度窗口')));
});
test('changes during query invalidate results before attribution is returned', async (t) => {
  const s = setup(t),
    g = s.group();
  s.rule(g);
  const run = s.tools.run.bind(s.tools);
  s.tools.run = async (...args) => {
    const result = await run(...args);
    s.links.removeRule(s.links.rules[0].id);
    return result;
  };
  assert.equal((await s.tools.query({ billingGroupId: g })).status, 'cancelled');
});
test('persisted rules reload without changing old files, hashes/private keys are not public', (t) => {
  const s = setup(t),
    g = s.group();
  s.rule(g);
  const raw = fs.readFileSync(s.links.file, 'utf8');
  const restored = new Associations({ store: s.store, accounts: s.accounts, tools: s.tools, now: () => now });
  assert.deepEqual(restored.publicState(), s.links.publicState());
  assert.equal(fs.readFileSync(s.links.file, 'utf8'), raw);
  assert.doesNotMatch(raw, /PRIVATE_KEY|apiKey|conversation/);
  assert.doesNotMatch(JSON.stringify(restored.publicState()), /sourceStamp|identityStamp|"stamp"|PRIVATE/);
});
test('corrupt configuration is preserved and does not overwrite user data', (t) => {
  const s = setup(t);
  fs.writeFileSync(s.links.file, 'BROKEN');
  const bad = new Associations({ store: s.store, accounts: s.accounts, tools: s.tools });
  assert.ok(bad.issue);
  assert.throws(() => bad.saveGroup({ label: 'test', memberIds: ['a'], primaryId: 'a', confirmed: true }), /无法读取/);
  assert.equal(fs.readFileSync(s.links.file, 'utf8'), 'BROKEN');
});
test('comparison requires same account, interval, unit, basis, complete coverage and freshness', () => {
  const base = {
    accountId: 'g',
    start: 1,
    end: 2,
    unit: 'tokens',
    basis: 'reported',
    scope: 'account',
    complete: true,
    fresh: true,
    value: 100,
  };
  assert.equal(compareEvidence(base, { ...base, value: 90 }).difference, -10);
  assert.equal(compareEvidence(base, { ...base, value: 90 }).errorRate, -10);
  for (const patch of [
    { accountId: 'other' },
    { start: 0 },
    { end: 3 },
    { unit: 'USD' },
    { basis: 'completed' },
    { scope: 'key' },
    { complete: false },
    { fresh: false },
    { value: null },
  ]) {
    const r = compareEvidence(base, { ...base, ...patch });
    assert.equal(r.available, false);
    assert.equal(r.difference, null);
    assert.equal(r.errorRate, null);
  }
  assert.equal(compareEvidence({ ...base, basis: null }, { ...base, basis: null }).available, false);
  assert.equal(compareEvidence({ ...base, value: 0 }, { ...base, value: 0 }).errorRate, null);
  assert.equal(compareEvidence(null, base).available, false);
});
