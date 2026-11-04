// T13.4 (D20 ①): CSV export of the tool records the analysis shows — same range, sources and filters; missing counts
// stay empty (never 0), cost is an estimate with its currency, spreadsheet formulas are neutralised, nothing private.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toolRecordsCsv, HEADER, cell } = require('../desktop/csv-export.cjs');
const { exportRecords, normalizeSubscriptionRecord } = require('../desktop/tool-analytics.cjs');
const { execute } = require('../desktop/tool-worker.cjs');

const NOW = Date.UTC(2026, 10, 5, 9);
const row = (id, at, usage, extra = {}) =>
  normalizeSubscriptionRecord(
    {
      tool: 'gemini-cli',
      requestId: id,
      attemptId: id,
      sessionId: 's1',
      timestamp: at,
      model: 'gemini-2.5-pro',
      project: null,
      status: 'unknown',
      usage,
      ...extra,
    },
    'src-1',
  );

test('T13.4: cells are escaped, formulas neutralised, missing values empty', () => {
  assert.equal(cell(null), '');
  assert.equal(cell(0), '0');
  assert.equal(cell('a,b'), '"a,b"');
  assert.equal(cell('say "hi"'), '"say ""hi"""');
  assert.equal(cell('line\nbreak'), '"line\nbreak"');
  assert.equal(cell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(cell('+1'), "'+1");
  assert.equal(cell('@cmd'), "'@cmd");
});

test('T13.4: one line per record with units, counts as reported and an estimated cost with its currency', () => {
  const rows = [
    {
      ...row('r1', NOW - 1000, { input: 100, output: 20, read: 60, write: null, reasoning: 5, total: 120 }),
      cost: 0.0012345,
      currency: 'USD',
    },
    { ...row('r2', NOW, { input: 7, output: 3 }), cost: null, currency: null, recordUnit: 'session-total' },
  ];
  const text = toolRecordsCsv(rows, { sources: { 'src-1': 'My, Gemini' }, tools: { 'gemini-cli': 'Gemini CLI' } });
  assert.ok(text.startsWith('﻿'), 'byte-order mark for spreadsheets');
  const lines = text.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], HEADER.join(','));
  const first = lines[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  assert.equal(first.length, HEADER.length);
  assert.deepEqual(first.slice(0, 5), [
    new Date(NOW - 1000).toISOString(),
    'Gemini CLI',
    '"My, Gemini"',
    '请求',
    '未知',
  ]);
  assert.deepEqual(first.slice(9, 17), ['100', '20', '60', '', '5', '120', '0.0012345', 'USD']);
  const second = lines[2].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  assert.equal(second[3], '会话汇总');
  assert.deepEqual(second.slice(11, 17), ['', '', '', '10', '', ''], 'unknown cache, reasoning and cost stay empty');
  assert.equal(second[7], '', 'no project is empty, not a placeholder');
});

test('T13.4: the selection follows the analysis filters and range, oldest first, deduplicated', () => {
  const rows = [
    row('a', NOW - 10, { input: 1, output: 1 }),
    row('b', NOW - 20, { input: 2, output: 2 }, { model: 'other' }),
    row('c', NOW - 5 * 86400000, { input: 3, output: 3 }),
    row('a', NOW - 10, { input: 1, output: 1 }),
  ];
  const range = { start: NOW - 86400000, end: NOW };
  assert.deepEqual(
    exportRecords(rows, range).map((r) => r.attemptId),
    ['b', 'a'],
  );
  const modelKey = exportRecords(rows, range).find((r) => r.attemptId === 'a').modelKey;
  assert.deepEqual(
    exportRecords(rows, range, { model: modelKey }).map((r) => r.attemptId),
    ['a'],
  );
  assert.deepEqual(exportRecords(rows, range, { sourceIds: ['other-source'] }), []);
  assert.deepEqual(exportRecords(rows, range, { billingGroupId: 'g1' }), [], 'unlinked records are not in a group');
});

test('T13.4: the worker export returns the records of the scanned sources, without content', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tua-csv-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const chats = path.join(dir, 'qwen', 'projects', 'p', 'chats');
  fs.mkdirSync(chats, { recursive: true });
  const now = Date.now();
  fs.writeFileSync(
    path.join(chats, 's.jsonl'),
    [
      {
        uuid: 'u1',
        sessionId: 's',
        timestamp: new Date(now - 60000).toISOString(),
        type: 'user',
        message: 'PRIVATE_PROMPT',
      },
      {
        uuid: 'u2',
        sessionId: 's',
        timestamp: new Date(now - 30000).toISOString(),
        type: 'assistant',
        model: 'qwen3-coder',
        message: 'PRIVATE_REPLY',
        usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 10, totalTokenCount: 50 },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n',
  );
  const result = execute({
    operation: 'export',
    indexFile: path.join(dir, 'index', 'tool-usage.sqlite'),
    sources: [{ id: 'q', kind: 'qwen-code', file: path.join(dir, 'qwen'), label: 'Qwen', enabled: true }],
    range: { start: now - 3600000, end: now },
    filters: {},
    prices: {},
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].total, 50);
  const csv = toolRecordsCsv(result.rows);
  assert.match(csv, /qwen3-coder/);
  assert.doesNotMatch(csv + JSON.stringify(result), /PRIVATE/);
});
