const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { quota } = require('./provider-domain.cjs');
const { readCodexAccount } = require('./codex-rpc.cjs');
const numeric = (v) => typeof v === 'number' && Number.isFinite(v);
const percent = (v) => (numeric(v) && v >= 0 && v <= 100 ? v : null);
function normalizeCodex(raw, plan) {
  const pools =
    raw?.rateLimitsByLimitId && typeof raw.rateLimitsByLimitId === 'object' && !Array.isArray(raw.rateLimitsByLimitId)
      ? Object.entries(raw.rateLimitsByLimitId)
      : raw?.rateLimits
        ? [[raw.rateLimits.limitId || 'codex', raw.rateLimits]]
        : [];
  if (!pools.length || pools.length > 100) throw new Error('schema');
  const windows = [];
  for (const [id, pool] of pools) {
    if (!pool || typeof pool !== 'object') throw new Error('schema');
    for (const key of ['primary', 'secondary']) {
      const w = pool[key];
      if (w == null) continue;
      if (percent(w.usedPercent) === null) throw new Error('schema');
      const mins = w.windowDurationMins,
        label =
          numeric(mins) && mins > 0
            ? mins % 10080 === 0
              ? mins / 10080 + ' 周窗口'
              : mins % 1440 === 0
                ? mins / 1440 + ' 天窗口'
                : mins % 60 === 0
                  ? mins / 60 + ' 小时窗口'
                  : mins + ' 分钟窗口'
            : key === 'primary'
              ? '主额度窗口'
              : '次额度窗口';
      windows.push(
        quota({
          id: 'codex:' + id + ':' + key,
          label,
          group: typeof pool.limitName === 'string' ? pool.limitName.slice(0, 120) : id.slice(0, 120),
          remainingPercent: 100 - w.usedPercent,
          resetAt: numeric(w.resetsAt) && w.resetsAt > 0 ? w.resetsAt * 1000 : null,
        }),
      );
    }
  }
  return {
    windows,
    planName: 'ChatGPT ' + String(plan || '未知套餐').slice(0, 50),
    note: '官方 Codex 订阅额度；各池与窗口不相加，不代表 ChatGPT 网页聊天的全部权益。Token 明细仅覆盖所选本机来源。',
  };
}
function normalizeClaude(raw, now = Date.now()) {
  if (
    raw?.schema !== 'token-usage-assistant.claude-quota' ||
    raw.schemaVersion !== 1 ||
    !numeric(raw.observedAt) ||
    raw.observedAt <= 0 ||
    raw.observedAt > now + 60000 ||
    !raw.windows ||
    typeof raw.windows !== 'object'
  )
    throw new Error('schema');
  const windows = [];
  for (const [key, label] of [
    ['five_hour', '5 小时窗口'],
    ['seven_day', '每周窗口'],
  ]) {
    const w = raw.windows[key];
    if (w == null) continue;
    if (percent(w.used_percentage) === null || !numeric(w.resets_at) || w.resets_at <= 0) throw new Error('schema');
    windows.push(
      quota({
        id: 'claude:' + key,
        label,
        group: 'Claude Code 订阅共享窗口',
        remainingPercent: 100 - w.used_percentage,
        resetAt: w.resets_at * 1000,
      }),
    );
  }
  return {
    windows,
    planName: 'Claude 本机订阅观察',
    note: '来自本地 Claude Code 状态栏；显示最近观察值。账户身份未由账单接口核验，网页聊天明细不在本机采集范围。',
  };
}
class SubscriptionClient {
  constructor(provider, { read = readCodexAccount, now = Date.now } = {}) {
    this.provider = provider;
    this.read = read;
    this.now = now;
  }
  async usage(credential) {
    try {
      if (this.provider === 'codex') {
        const raw = await this.read(credential),
          email = raw.account.email;
        const accountId =
          typeof email === 'string' && email
            ? crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')
            : null;
        if (credential.binding && accountId !== credential.binding)
          return {
            parts: {},
            errors: [
              {
                status: 401,
                code: 'account-changed',
                message: 'Codex 当前登录账户已变化，请更新此连接；未合并另一账户的额度。',
              },
            ],
            clearParts: true,
          };
        return {
          parts: {
            identity: { accountId, planType: raw.account.planType },
            credits: normalizeCodex(raw.limits, raw.account.planType),
          },
          errors: [],
        };
      }
      const file = path.join(credential.home, 'quota.json');
      if (!fs.existsSync(file))
        return {
          parts: {
            credits: {
              windows: [],
              planName: 'Claude 本机订阅观察',
              note: '等待 Claude Code 发出首条套餐额度。请使用生成的启动脚本运行已登录订阅的 Claude Code。',
            },
          },
          errors: [],
          stale: true,
          observedAt: 0,
        };
      if (fs.statSync(file).size > 16384) throw new Error('schema');
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')),
        credits = normalizeClaude(raw, this.now());
      let health;
      try {
        health = JSON.parse(fs.readFileSync(path.join(credential.home, 'status.json'), 'utf8'));
      } catch {}
      const stale =
        health?.state !== 'ready' ||
        !credits.windows.length ||
        this.now() - raw.observedAt > 300000 ||
        credits.windows.some((w) => w.resetAt <= this.now());
      return { parts: { credits }, errors: [], observedAt: raw.observedAt, stale };
    } catch (e) {
      return {
        parts: {},
        errors: [
          {
            status: 0,
            code: 'local-subscription',
            message:
              e.publicMessage ||
              (this.provider === 'codex'
                ? 'Codex 额度暂时无法读取，请检查客户端、网络和登录状态。'
                : 'Claude 本地额度文件缺失或格式不支持，请检查采集组件。'),
          },
        ],
      };
    }
  }
}
module.exports = { SubscriptionClient, normalizeCodex, normalizeClaude };
