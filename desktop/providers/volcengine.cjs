// Volcengine Agent Plan (registry entry, T5.3a): signed POST GetAFPUsage, Beijing region only.
const crypto = require('node:crypto');
const { normalizeVolcengine } = require('../provider-domain.cjs');
const origins = Object.freeze({ 'cn-beijing': 'https://ark.cn-beijing.volcengineapi.com' });
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
function signVolcengine(credential, now = Date.now()) {
  const host = 'ark.cn-beijing.volcengineapi.com',
    query = 'Action=GetAFPUsage&Version=2024-01-01',
    body = '{}';
  const date = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, ''),
    day = date.slice(0, 8);
  const payload = hash(body),
    signed = 'content-type;host;x-content-sha256;x-date';
  const canonical =
    'POST\n/\n' +
    query +
    '\ncontent-type:application/json\nhost:' +
    host +
    '\nx-content-sha256:' +
    payload +
    '\nx-date:' +
    date +
    '\n\n' +
    signed +
    '\n' +
    payload;
  const scope = day + '/cn-beijing/ark/request';
  const signingKey = hmac(hmac(hmac(hmac(credential.secretKey, day), 'cn-beijing'), 'ark'), 'request');
  const signature = hmac(signingKey, 'HMAC-SHA256\n' + date + '\n' + scope + '\n' + hash(canonical)).toString('hex');
  return {
    url: 'https://' + host + '/?' + query,
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Date': date,
      'X-Content-Sha256': payload,
      Authorization:
        'HMAC-SHA256 Credential=' +
        credential.accessKeyId +
        '/' +
        scope +
        ', SignedHeaders=' +
        signed +
        ', Signature=' +
        signature,
    },
  };
}
module.exports = {
  id: 'volcengine',
  capabilities: { quota: true, balance: false, usageSummary: false, actualBilling: false },
  name: '火山 Agent Plan',
  // T6.1: how far this platform has been checked (live = a real account was observed read-only; contract = only
  // the official interface samples). Not a reconciliation; see PROJECT_HANDOFF for the evidence.
  verification: { level: 'contract', date: '2026-10-15', note: '只用官方接口样例测试过，未用真实账户核对' },
  regions: [{ id: 'cn-beijing', name: '国内 · 北京' }],
  credential: 'aksk',
  note: '个人版 Agent Plan；填写有 GetAFPUsage 查询权限的 Access Key ID 和 Secret Access Key。模型 API Key 不适用。',
  clientKind: 'quota',
  origins,
  buildRequest: (credential, region, now) => signVolcengine(credential, now),
  classifyBodyError(body) {
    if (body.ResponseMetadata?.Error) {
      const code = String(body.ResponseMetadata.Error.Code || '');
      return [
        'upstream',
        /InvalidAccessKey|SignatureDoesNotMatch|InvalidToken|ExpiredToken/.test(code)
          ? 401
          : /AccessDenied|Forbidden|Unauthorized/.test(code)
            ? 403
            : /Throttl|LimitExceeded/.test(code)
              ? 429
              : 0,
      ];
    }
    return null;
  },
  normalize: (raw) => normalizeVolcengine(raw),
  officialUrl: ({ region }) => ({ 'cn-beijing': 'https://ark.volcengine.com/region:cn-beijing' })[region] || null,
  signVolcengine,
};
