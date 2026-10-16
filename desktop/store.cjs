const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DEFAULT_SETTINGS, patchSettings } = require('./domain.cjs');
const { log } = require('./logger.cjs');
// Windows can briefly lock the target (antivirus, indexer, another reader): these rename errors are retried.
const RENAME_RETRY = new Set(['EPERM', 'EBUSY', 'EACCES']),
  RENAME_RETRIES = 5,
  RENAME_BACKOFF_MS = 50;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Write JSON to a unique temp file next to the target, fsync it, then rename it over the target (T4.6).
// On final failure the temp file is removed and the original error is rethrown; the target is left untouched.
function atomicWrite(file, value) {
  let temp = null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const fd = fs.openSync(temp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(value), 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(temp, file);
        temp = null;
        return;
      } catch (e) {
        if (attempt >= RENAME_RETRIES || !RENAME_RETRY.has(e?.code)) throw e;
        pause(RENAME_BACKOFF_MS);
      }
    }
  } catch (e) {
    if (temp)
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        // Best effort: the original error below matters more than a leftover temp file.
      }
    log.warn('store', 'write-failed', { errno: e?.code });
    throw e;
  }
}
function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function fingerprint(key, orgId = '') {
  return crypto
    .createHash('sha256')
    .update(key + '\0' + orgId)
    .digest('hex');
}
class LocalStore {
  constructor(root, safeStorage) {
    this.root = root;
    this.safeStorage = safeStorage;
  }
  file(name) {
    return path.join(this.root, name);
  }
  settings() {
    const raw = readJson(this.file('settings.json'), {});
    let settings = { ...DEFAULT_SETTINGS };
    for (const [k, v] of Object.entries(raw.preferences || {})) {
      try {
        settings = patchSettings(settings, { [k]: v });
      } catch {
        // An invalid stored preference is skipped and the default kept, as before.
        log.warn('store', 'invalid-preference-skipped');
      }
    }
    return { preferences: settings, bounds: raw.bounds || {} };
  }
  saveSettings(preferences, bounds) {
    atomicWrite(this.file('settings.json'), { preferences, bounds });
  }
  credentials() {
    const raw = readJson(this.file('credentials.encrypted.json'));
    if (!raw?.ciphertext) return null;
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用');
    try {
      const v = JSON.parse(this.safeStorage.decryptString(Buffer.from(raw.ciphertext, 'base64')));
      if (typeof v.key !== 'string' || typeof v.orgId !== 'string') throw new Error();
      return v;
    } catch {
      throw new Error('本机密钥无法解密，请重新连接账户');
    }
  }
  saveCredentials(key, orgId) {
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用，未保存密钥');
    const ciphertext = this.safeStorage.encryptString(JSON.stringify({ key, orgId })).toString('base64');
    atomicWrite(this.file('credentials.encrypted.json'), { version: 1, ciphertext });
  }
  clearCredentials() {
    for (const file of ['credentials.encrypted.json', 'snapshot.json', 'history.json']) {
      try {
        fs.unlinkSync(this.file(file));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
  }
  cache(hash) {
    const v = readJson(this.file('snapshot.json'));
    return v?.fingerprint === hash && v?.data && typeof v.data.parts === 'object' ? v.data : null;
  }
  saveCache(hash, data) {
    atomicWrite(this.file('snapshot.json'), { fingerprint: hash, data });
  }
  accounts() {
    const file = this.file('accounts.encrypted.json');
    if (!fs.existsSync(file)) {
      const legacyFile = this.file('credentials.encrypted.json');
      if (fs.existsSync(legacyFile) && !readJson(legacyFile)?.ciphertext)
        throw new Error('旧版密钥文件无法读取，未覆盖已有连接');
      const legacy = this.credentials();
      return {
        activeId: legacy ? 'legacy-commandcode' : '',
        accounts: legacy
          ? [
              {
                id: 'legacy-commandcode',
                provider: 'commandcode',
                region: 'global',
                label: 'Command Code',
                orgId: legacy.orgId,
                credential: { apiKey: legacy.key },
              },
            ]
          : [],
      };
    }
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用');
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw.version !== 2 || typeof raw.ciphertext !== 'string') throw new Error();
      const value = JSON.parse(this.safeStorage.decryptString(Buffer.from(raw.ciphertext, 'base64')));
      if (!Array.isArray(value.accounts) || value.accounts.length > 20 || typeof value.activeId !== 'string')
        throw new Error();
      return value;
    } catch {
      throw new Error('本机账户列表无法解密，未覆盖已有连接');
    }
  }
  saveAccounts(value) {
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用');
    const ciphertext = this.safeStorage.encryptString(JSON.stringify(value)).toString('base64');
    atomicWrite(this.file('accounts.encrypted.json'), { version: 2, ciphertext });
    // Only remove the old credential after the replacement has been durably written.
    try {
      fs.unlinkSync(this.file('credentials.encrypted.json'));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        /* The encrypted v2 vault is already authoritative. */
      }
    }
  }
}
module.exports = { LocalStore, fingerprint, atomicWrite, readJson };
