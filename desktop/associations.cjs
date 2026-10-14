const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { atomicWrite } = require('./store.cjs');
const { accountFingerprint } = require('./accounts.cjs');
const { overlaps, compareEvidence } = require('./association-rules.cjs');
const { rangeFor } = require('./analytics-core.cjs');
const { pathKey } = require('./platform.cjs');
const id = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);
const fail = (message) => Object.assign(new Error(message), { publicMessage: message });
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const label = (value) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[\x00-\x1f]/.test(value))
    throw fail('请输入 1–80 个字符的计费账户名称。');
  return value.trim();
};
function sourceStamp(source) {
  try {
    const file = fs.realpathSync(source.file),
      stat = fs.statSync(file);
    return hash([
      source.kind,
      source.installationId || null,
      stat.dev,
      stat.ino || pathKey(file),
      source.kind === 'codex' ? stat.isDirectory() : stat.isFile(),
    ]);
  } catch {
    return null;
  }
}
function memberStamp(entry) {
  return hash([accountFingerprint(entry), entry.credential.binding || null]);
}
function knownIdentity(runtime) {
  const identity = runtime?.monitor.state.parts.identity;
  return runtime?.entry.provider === 'codex'
    ? runtime.entry.credential.binding
    : runtime?.entry.provider === 'commandcode' && identity?.accountId
      ? JSON.stringify([identity.accountId, identity.scope, identity.orgId || runtime.entry.orgId || ''])
      : null;
}
class Associations extends EventEmitter {
  constructor({ store, accounts, tools, now = Date.now }) {
    super();
    Object.assign(this, { store, accounts, tools, now });
    this.file = store.file('account-links.json');
    this.groups = [];
    this.rules = [];
    this.issue = '';
    this.revision = 0;
    if (fs.existsSync(this.file))
      try {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (
          raw.schemaVersion !== 1 ||
          !Array.isArray(raw.groups) ||
          !Array.isArray(raw.rules) ||
          raw.groups.length > 20 ||
          raw.rules.length > 200
        )
          throw Error();
        for (const g of raw.groups) {
          if (
            !id(g.id) ||
            label(g.label) !== g.label ||
            !Number.isInteger(g.epoch) ||
            g.epoch < 1 ||
            !Array.isArray(g.members) ||
            !g.members.length ||
            g.members.length > 20 ||
            new Set(g.members.map((m) => m.id)).size !== g.members.length ||
            g.members.some(
              (m) =>
                typeof m.id !== 'string' ||
                !/^[a-f0-9]{64}$/.test(m.stamp) ||
                (m.identityStamp !== null && m.identityStamp !== undefined && !/^[a-f0-9]{64}$/.test(m.identityStamp)),
            ) ||
            !g.members.some((m) => m.id === g.primaryId)
          )
            throw Error();
        }
        for (const r of raw.rules) {
          if (
            !id(r.id) ||
            !id(r.groupId) ||
            typeof r.sourceId !== 'string' ||
            !Number.isInteger(r.groupEpoch) ||
            r.groupEpoch < 1 ||
            !/^[a-f0-9]{64}$/.test(r.sourceStamp)
          )
            throw Error();
          this.validateRuleFields(r);
        }
        if (
          new Set(raw.groups.map((g) => g.id)).size !== raw.groups.length ||
          new Set(raw.rules.map((r) => r.id)).size !== raw.rules.length ||
          new Set(raw.groups.flatMap((g) => g.members.map((m) => m.id))).size !==
            raw.groups.reduce((n, g) => n + g.members.length, 0)
        )
          throw Error();
        this.groups = raw.groups.map((g) => ({
          id: g.id,
          label: g.label,
          epoch: g.epoch,
          primaryId: g.primaryId,
          members: g.members.map((m) => ({ id: m.id, stamp: m.stamp, identityStamp: m.identityStamp || null })),
          createdAt: g.createdAt,
        }));
        this.rules = raw.rules.map((r) => ({
          id: r.id,
          sourceId: r.sourceId,
          groupId: r.groupId,
          groupEpoch: r.groupEpoch,
          sourceStamp: r.sourceStamp,
          from: r.from,
          to: r.to,
          provider: r.provider,
          model: r.model,
          createdAt: r.createdAt,
        }));
      } catch {
        this.issue = '账户关联配置无法读取，原文件已保留；关联和核对暂停，请恢复备份后重启。';
      }
  }
  save(groups, rules) {
    if (this.issue) throw fail(this.issue);
    try {
      atomicWrite(this.file, { schemaVersion: 1, groups, rules });
    } catch {
      throw fail('账户关联无法保存，原设置保持不变。');
    }
    this.groups = groups;
    this.rules = rules;
    this.revision++;
    this.emit('change');
  }
  validateMembers(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length)
      throw fail('请选择至少一个连接，每个连接只选一次。');
    const entries = ids.map((id) => this.accounts.entries.find((e) => e.id === id));
    if (entries.some((e) => !e)) throw fail('部分连接已不存在，请重新选择。');
    if (new Set(entries.map((e) => JSON.stringify([e.provider, e.region, e.orgId || '']))).size !== 1)
      throw fail('只能将同平台、同地区和同组织范围的连接归为一个账户。');
    const known = entries.map((e) => knownIdentity(this.accounts.runtimes.get(e.id))).filter(Boolean);
    if (new Set(known).size > 1) throw fail('这些连接返回的账户身份不同，不能归入同一计费账户。');
    return entries;
  }
  saveGroup(value) {
    if (value?.confirmed !== true) throw fail('请明确确认所选连接属于同一个计费账户。');
    const old = value.id ? this.groups.find((g) => g.id === value.id) : null;
    if (value.id && !old) throw fail('计费账户组不存在。');
    if (!old && this.groups.length >= 20) throw fail('最多创建 20 个计费账户组。');
    const entries = this.validateMembers(value.memberIds);
    if (this.groups.some((g) => g.id !== old?.id && g.members.some((m) => value.memberIds.includes(m.id))))
      throw fail('所选连接已在另一计费账户组内。');
    if (!value.memberIds.includes(value.primaryId)) throw fail('请选择组内一个连接作为平台数据来源。');
    const members = entries
        .map((e) => ({
          id: e.id,
          stamp: memberStamp(e),
          identityStamp: knownIdentity(this.accounts.runtimes.get(e.id))
            ? hash(knownIdentity(this.accounts.runtimes.get(e.id)))
            : null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      changed = old && JSON.stringify(members) !== JSON.stringify(old.members);
    const group = {
      id: old?.id || crypto.randomUUID(),
      label: label(value.label),
      members,
      primaryId: value.primaryId,
      epoch: (old?.epoch || 1) + (changed ? 1 : 0),
      createdAt: old?.createdAt || this.now(),
    };
    this.save(old ? this.groups.map((g) => (g.id === old.id ? group : g)) : [...this.groups, group], this.rules);
    return group.id;
  }
  removeGroup(groupId) {
    if (!this.groups.some((g) => g.id === groupId)) throw fail('计费账户组不存在。');
    this.save(
      this.groups.filter((g) => g.id !== groupId),
      this.rules.filter((r) => r.groupId !== groupId),
    );
    return true;
  }
  groupState(g) {
    let reason = this.issue || '';
    const entries = g.members.map((m) => this.accounts.entries.find((e) => e.id === m.id));
    if (entries.some((e) => !e)) reason = '组内连接已移除，请重新确认成员。';
    else if (entries.some((e, i) => memberStamp(e) !== g.members[i].stamp))
      reason = '连接身份或密钥已变化，请重新确认归组与关联。';
    else if (
      entries.some((e, i) => {
        const known = knownIdentity(this.accounts.runtimes.get(e.id));
        return known && g.members[i].identityStamp && hash(known) !== g.members[i].identityStamp;
      })
    )
      reason = '平台返回的账户身份已变化，请重新确认归组与关联。';
    else
      try {
        this.validateMembers(g.members.map((m) => m.id));
      } catch (e) {
        reason = e.publicMessage;
      }
    const primary = this.accounts.runtimes.get(g.primaryId),
      data = primary?.monitor.snapshot(),
      entry = entries[0],
      sub = data?.parts.subscription,
      stamp = data?.updatedAt.subscription;
    const fresh =
      data?.status === 'connected' &&
      stamp &&
      this.now() - stamp <= Math.max(180000, this.accounts.settings.refreshSeconds * 3000);
    const period =
      !reason &&
      fresh &&
      sub?.active &&
      Number.isFinite(sub.start) &&
      Number.isFinite(sub.end) &&
      sub.start < this.now() &&
      sub.end > this.now()
        ? { start: sub.start, end: sub.end }
        : null;
    if (
      entries.some(
        (e) => e?.provider === 'codex' && this.accounts.runtimes.get(e.id)?.monitor.state.status === 'auth-error',
      )
    )
      reason = 'Codex 登录身份需要核实，请重新连接并确认归组。';
    return {
      id: g.id,
      label: g.label,
      epoch: g.epoch,
      memberIds: g.members.map((m) => m.id),
      primaryId: g.primaryId,
      provider: entry?.provider || null,
      region: entry?.region || null,
      valid: !reason,
      message: reason,
      basis: 'manual',
      period: reason ? null : period,
    };
  }
  context() {
    const groups = this.groups.map((g) => this.groupState(g)),
      byId = new Map(groups.map((g) => [g.id, g]));
    const rules = this.rules.map((r) => {
      const g = byId.get(r.groupId),
        source = this.tools.entries.find((s) => s.id === r.sourceId);
      const reason =
        this.issue ||
        (!g?.valid
          ? '计费账户归组需要重新确认。'
          : g.epoch !== r.groupEpoch
            ? '归组成员已变动，请重新确认此关联。'
            : !source
              ? '工具来源已移除。'
              : sourceStamp(source) !== r.sourceStamp
                ? '工具文件身份或位置已变化，请重新确认关联。'
                : '');
      return {
        id: r.id,
        sourceId: r.sourceId,
        groupId: r.groupId,
        from: r.from,
        to: r.to,
        provider: r.provider,
        model: r.model,
        valid: !reason,
        message: reason,
        basis: 'manual',
      };
    });
    return { groups, rules, issue: this.issue, signature: hash([this.revision, groups, rules]) };
  }
  publicState() {
    const { signature, ...state } = this.context();
    return state;
  }
  validateRuleFields(value) {
    if (
      !Number.isSafeInteger(value.from) ||
      value.from < 0 ||
      value.from > 8640000000000000 ||
      (value.to !== null && (!Number.isSafeInteger(value.to) || value.to <= value.from || value.to > 8640000000000000))
    )
      throw fail('请选择有效的关联起止时间；结束时间必须晚于开始时间。');
    for (const key of ['provider', 'model'])
      if (typeof value[key] !== 'string' || value[key].length > 2048 || /[\x00-\x1f]/.test(value[key]))
        throw fail('供应商或模型条件无效。');
  }
  saveRule(value) {
    if (value?.confirmed !== true) throw fail('请确认所选记录范围属于这个计费账户。');
    const old = value.id ? this.rules.find((r) => r.id === value.id) : null;
    if (value.id && !old) throw fail('关联规则不存在。');
    if (!old && this.rules.length >= 200) throw fail('最多保存 200 条关联规则。');
    const source = this.tools.entries.find((s) => s.id === value.sourceId),
      group = this.groups.find((g) => g.id === value.groupId),
      stamp = source && sourceStamp(source);
    if (!source || !stamp) throw fail('工具来源无法访问，请先检查文件位置。');
    if (!group || !this.groupState(group).valid) throw fail('请先建立并确认有效的计费账户组。');
    const rule = {
      id: old?.id || crypto.randomUUID(),
      sourceId: source.id,
      groupId: group.id,
      groupEpoch: group.epoch,
      sourceStamp: stamp,
      from: value.from,
      to: value.to ?? null,
      provider: value.provider || '',
      model: value.model || '',
      createdAt: old?.createdAt || this.now(),
    };
    this.validateRuleFields(rule);
    if (this.rules.some((r) => r.id !== old?.id && overlaps(r, rule)))
      throw fail('同一来源已有时间和条件重叠的关联，请先调整旧规则的结束时间或筛选条件。');
    this.save(this.groups, old ? this.rules.map((r) => (r.id === old.id ? rule : r)) : [...this.rules, rule]);
    return rule.id;
  }
  removeRule(ruleId) {
    if (!this.rules.some((r) => r.id === ruleId)) throw fail('关联规则不存在。');
    this.save(
      this.groups,
      this.rules.filter((r) => r.id !== ruleId),
    );
    return true;
  }
  async reconcile(query, prices) {
    const before = this.context(),
      g = before.groups.find((g) => g.id === query.groupId);
    if (!g) throw fail('请选择一个计费账户组。');
    const range = rangeFor(query.range || 'today', this.now(), g.period?.start);
    const base = {
      source: 'reconciliation',
      group: g,
      range,
      available: false,
      difference: null,
      errorRate: null,
      basis: 'manual',
      sumOfPlatformAndTools: null,
    };
    if (!g.valid || !range.start)
      return {
        ...base,
        reasons: [g.message || '此账户尚未提供有效账期，请改选今日或近 7 天。'],
        tools: null,
        platform: null,
      };
    const runtime = this.accounts.runtimes.get(g.primaryId),
      data = runtime.monitor.snapshot(),
      summary = data.parts.summary,
      credits = data.parts.credits,
      balance = data.parts.balance;
    const tools = await this.tools.query(
      { range: query.range || 'today', billingGroupId: g.id, requestId: query.requestId },
      prices,
      { range },
    );
    if (this.context().signature !== before.signature)
      return { ...base, reasons: ['关联或账户状态已变化，请重新核对。'], tools: null, platform: null };
    const tokenPeriod = summary
      ? { start: summary.periodStart || null, end: summary.periodEnd || null, scope: summary.scope }
      : null;
    const platform = {
      connectionId: g.primaryId,
      connectionLabel: runtime.entry.label,
      memberCount: g.memberIds.length,
      status: data.status,
      updatedAt: data.updatedAt.summary || data.updatedAt.balance || data.updatedAt.credits || null,
      kind: summary ? 'summary' : balance ? 'balance' : credits ? 'quota' : 'missing',
      summary: summary
        ? {
            input: summary.input,
            output: summary.output,
            total: summary.total,
            requests: summary.requests,
            cost: summary.cost,
            currency: 'USD',
            period: tokenPeriod,
          }
        : null,
      balance: balance || null,
      credits: credits || null,
    };
    const reasons = [];
    if (!before.rules.some((r) => r.groupId === g.id && r.valid))
      reasons.push('此计费账户尚未关联任何有效工具记录范围。');
    if (before.rules.some((r) => r.groupId === g.id && !r.valid))
      reasons.push('部分关联需要重新确认，相关记录不会归入账户。');
    if (!summary && !balance && !credits) reasons.push('平台尚无可用数据，请先同步主查询连接。');
    if (!summary && (balance || credits))
      reasons.push(
        balance
          ? '平台仅提供余额，余额变化不能与工具 Token 或估算费用核对。'
          : '平台仅提供额度窗口，不能换算为工具 Token 或费用。',
      );
    if (
      summary &&
      (!tokenPeriod.start || !tokenPeriod.end || tokenPeriod.start !== range.start || tokenPeriod.end !== range.end)
    )
      reasons.push('平台汇总与工具记录的起止时间未严格对齐，当前汇总仅供参考。');
    if (summary) reasons.push('平台汇总的请求统计口径与本机已报告用量口径尚未确认一致。');
    if (!tools.coverage?.complete) reasons.push('本机采集不能证明覆盖该账户在所有设备和工具上的完整用量。');
    if (!tools.summary || tools.summary.missingTokenRequests)
      reasons.push('工具记录为空或部分记录缺少用量，缺失值不能计为零。');
    if (
      data.status !== 'connected' ||
      !platform.updatedAt ||
      this.now() - platform.updatedAt > Math.max(180000, this.accounts.settings.refreshSeconds * 3000) ||
      !tools.updatedAt ||
      tools.status !== 'ready'
    )
      reasons.push('存在未同步、延迟或读取失败的数据，请先检查各来源。');
    reasons.push('工具费用来自本机单价估算，不作为平台实际账单核对。');
    return {
      ...base,
      platform,
      tools,
      reasons,
      comparison: compareEvidence(null, null),
      coverage: tools.coverage || null,
      association: tools.association || null,
      rules: before.rules.filter((r) => r.groupId === g.id),
    };
  }
}
module.exports = { Associations, sourceStamp, memberStamp };
