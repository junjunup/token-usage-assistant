const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// T8.13: reviewed runtimes and their upstream tag commits (same list as the shipped exporter). Since T9.13 (D15) the
// version is informational: every runtime is read when each line passes the strict record checks.
const VERIFIED = Object.freeze({
  '0.1.7-rc.1': '46a7f68b0922371ce7144b668b90e377d8e799f4',
  '0.2.1-rc.2': '687f282e8625c6b8d11ff58211a90524be2e4317',
});
const VERSION = '0.2.1-rc.2';
const COMMIT = VERIFIED[VERSION];
const RUNTIME = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,40})?$/;
const EXPORTERS = new Set(['1.4.0', '1.5.0']);
const verified = (version) => Object.hasOwn(VERIFIED, version);
function unsupported() {
  return Object.assign(new Error('Harness 导出版本或格式不受支持，请按随附说明配置统计插件。'), {
    publicMessage: 'Harness 导出版本或格式不受支持，请按随附说明配置统计插件。',
    code: 'UNSUPPORTED_HARNESS_FORMAT',
  });
}
function readManifest(file) {
  try {
    if (path.basename(file) !== 'usage.jsonl') throw unsupported();
    const mf = path.join(path.dirname(file), 'source.json');
    if (fs.statSync(mf).size > 8192) throw unsupported();
    const v = JSON.parse(fs.readFileSync(mf, 'utf8'));
    if (
      v.schema !== 'token-usage-assistant.harness-source' ||
      v.schemaVersion !== 1 ||
      v.tool !== 'deepseek-harness' ||
      typeof v.harnessVersion !== 'string' ||
      !RUNTIME.test(v.harnessVersion) ||
      !EXPORTERS.has(v.exporterVersion) ||
      v.harnessCommit !== (verified(v.harnessVersion) ? VERIFIED[v.harnessVersion] : null) ||
      v.sessionFormatVersion !== 4 ||
      typeof v.sourceId !== 'string' ||
      !/^[\w-]{1,100}$/.test(v.sourceId) ||
      !Number.isSafeInteger(v.createdAt)
    )
      throw unsupported();
    return {
      sourceId: v.sourceId,
      createdAt: v.createdAt,
      harnessVersion: v.harnessVersion,
      harnessCommit: v.harnessCommit,
    };
  } catch {
    throw unsupported();
  }
}
function initIndex(db) {
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS tool_records(source_id TEXT NOT NULL,attempt_id TEXT NOT NULL,revision INTEGER NOT NULL,at INTEGER NOT NULL,record TEXT NOT NULL,PRIMARY KEY(source_id,attempt_id)); CREATE INDEX IF NOT EXISTS tool_records_time ON tool_records(source_id,at); CREATE TABLE IF NOT EXISTS tool_cursors(source_id TEXT PRIMARY KEY,file_identity TEXT,offset INTEGER,anchor TEXT);',
  );
}
function anchor(fd, offset) {
  const size = Math.min(offset, 256),
    buf = Buffer.alloc(size);
  fs.readSync(fd, buf, 0, size, offset - size);
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function scanHarness(db, source, range, normalize) {
  if (!fs.existsSync(source.file))
    return { rows: [], status: 'missing', message: '未找到 Harness 用量导出文件，请检查插件或重新选择位置。' };
  let fd,
    transaction = false;
  try {
    const manifest = readManifest(source.file);
    if (source.installationId && manifest.sourceId !== source.installationId) throw unsupported();
    // Plugin health contains fixed codes only. Never forward arbitrary diagnostic text.
    const healthFile = path.join(path.dirname(source.file), 'status.json');
    let unhealthy = true;
    if (fs.existsSync(healthFile)) {
      unhealthy = true;
      if (fs.statSync(healthFile).size < 8192) {
        try {
          const health = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
          unhealthy =
            health.schema !== 'token-usage-assistant.harness-status' ||
            health.schemaVersion !== 1 ||
            health.sourceId !== manifest.sourceId ||
            health.state !== 'ready' ||
            !Array.isArray(health.gaps) ||
            health.gaps.length > 0;
        } catch {
          // Probe: the optional status file may be missing or unreadable; the source then stays unhealthy.
        }
      }
    }
    fd = fs.openSync(source.file, 'r');
    const stat = fs.fstatSync(fd),
      identity = `${stat.dev}:${stat.ino}`;
    const cursor = db.prepare('SELECT * FROM tool_cursors WHERE source_id=?').get(source.id);
    let offset =
      cursor &&
      cursor.file_identity === identity &&
      cursor.offset <= stat.size &&
      anchor(fd, cursor.offset) === cursor.anchor
        ? cursor.offset
        : 0;
    db.exec('BEGIN IMMEDIATE');
    transaction = true;
    const upsert = db.prepare(
      'INSERT INTO tool_records VALUES (?,?,?,?,?) ON CONFLICT(source_id,attempt_id) DO UPDATE SET revision=excluded.revision,at=excluded.at,record=excluded.record WHERE excluded.revision>tool_records.revision',
    );
    const prior = db.prepare('SELECT revision,record FROM tool_records WHERE source_id=? AND attempt_id=?');
    const buffer = Buffer.alloc(65536);
    let carry = Buffer.alloc(0),
      position = offset,
      committed = offset,
      imported = 0;
    while (position < stat.size) {
      const length = fs.readSync(fd, buffer, 0, Math.min(buffer.length, stat.size - position), position);
      if (!length) break;
      position += length;
      const chunk = Buffer.concat([carry, buffer.subarray(0, length)]);
      let begin = 0,
        end;
      while ((end = chunk.indexOf(10, begin)) !== -1) {
        const line = chunk.subarray(begin, end);
        if (line.length > 32768) throw unsupported();
        if (line.length) {
          let wire;
          try {
            wire = JSON.parse(line.toString('utf8'));
          } catch {
            throw unsupported();
          }
          if (
            wire.sourceId !== manifest.sourceId ||
            !EXPORTERS.has(wire.exporterVersion) ||
            wire.tool !== 'deepseek-harness' ||
            !Number.isSafeInteger(wire.revision) ||
            wire.revision < 0
          )
            throw unsupported();
          const record = normalize(wire, source.id),
            old = prior.get(source.id, record.attemptId);
          if (old && old.revision < wire.revision && !record.usageReported) {
            const previous = JSON.parse(old.record);
            if (previous.usageReported) {
              for (const field of [
                'input',
                'output',
                'total',
                'read',
                'write',
                'fresh',
                'reasoning',
                'cacheKnown',
                'extra',
                'invalidUsage',
              ])
                record[field] = previous[field];
              record.usageReported = true;
            }
          }
          upsert.run(source.id, record.attemptId, wire.revision, record.at, JSON.stringify(record));
          imported++;
        }
        begin = end + 1;
        committed = position - (chunk.length - begin);
      }
      carry = Buffer.from(chunk.subarray(begin));
      if (carry.length > 32768) throw unsupported();
    }
    db.prepare(
      'INSERT INTO tool_cursors VALUES (?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET file_identity=excluded.file_identity,offset=excluded.offset,anchor=excluded.anchor',
    ).run(source.id, identity, committed, anchor(fd, committed));
    db.exec('COMMIT');
    transaction = false;
    const stored = db
      .prepare('SELECT record FROM tool_records WHERE source_id=? AND at>=? AND at<=? ORDER BY at DESC LIMIT 100001')
      .all(source.id, range.start - (range.end - range.start), range.end);
    const truncated = stored.length > 100000;
    if (truncated) stored.pop();
    const rows = stored.map((row) => JSON.parse(row.record));
    return {
      rows,
      status: unhealthy ? 'stale' : 'ready',
      message: unhealthy
        ? '插件状态未确认、已停止或存在采集缺口；仅统计文件中已有的记录。'
        : carry.length
          ? '导出文件末尾尚未写完，将在下次同步继续读取。'
          : '',
      truncated,
      partialLine: carry.length > 0,
      imported,
      installationId: manifest.sourceId,
      harnessVersion: manifest.harnessVersion,
    };
  } catch (e) {
    if (transaction)
      try {
        db.exec('ROLLBACK');
      } catch {
        // Best-effort rollback; the original failure is returned below.
      }
    return {
      rows: [],
      status: e.code === 'UNSUPPORTED_HARNESS_FORMAT' ? 'schema' : 'error',
      message:
        e.code === 'UNSUPPORTED_HARNESS_FORMAT'
          ? unsupported().message
          : 'Harness 记录暂时无法读取，请检查导出文件后重试。',
    };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
module.exports = { VERSION, COMMIT, VERIFIED, readManifest, initIndex, scanHarness };
