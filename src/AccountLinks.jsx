import React, { useEffect, useState } from 'react';
import { Disclosure } from './Disclosure.jsx';
import { Link, Plus, Info, ArrowClockwise, ListChecks } from '@phosphor-icons/react';
import { Select } from './Select.jsx';
import { useAnalytics } from './useAnalytics.js';
import { RangeControl } from './AnalyticsPage.jsx';
import { formatAmount } from './generated/balance-domain.js';
import { providerInfo } from './generated/provider-catalog.js';
import { coverageReport } from './generated/coverage-report.js';
import './account-links.css';
const stamp = (v) => (Number.isFinite(v) ? new Date(v).toLocaleString('zh-CN') : '未确认');
const localDate = (v) => {
  const d = new Date(v);
  return new Date(v - d.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
};
const number = (v) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: 8 }) : '—';
const newGroup = () => ({ id: '', label: '', memberIds: [], primaryId: '', confirmed: false });
const newRule = () => ({
  id: '',
  sourceId: '',
  groupId: '',
  from: localDate(Date.now()),
  to: '',
  provider: '',
  model: '',
  confirmed: false,
});
export function AccountLinks({ state, run }) {
  const data = state.associations || { groups: [], rules: [] },
    accounts = state.accounts || [],
    sources = state.toolSources || [];
  const [group, setGroup] = useState(newGroup),
    [rule, setRule] = useState(newRule),
    [busy, setBusy] = useState(false);
  const accountLabel = (id) => accounts.find((a) => a.id === id)?.label || '已移除连接',
    sourceLabel = (id) => sources.find((s) => s.id === id)?.label || '已移除来源';
  async function save(kind, value, reset) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await run(kind, value);
      if (result) reset();
    } finally {
      setBusy(false);
    }
  }
  function toggleMember(id) {
    const memberIds = group.memberIds.includes(id) ? group.memberIds.filter((v) => v !== id) : [...group.memberIds, id];
    setGroup({
      ...group,
      memberIds,
      primaryId: memberIds.includes(group.primaryId) ? group.primaryId : memberIds[0] || '',
      confirmed: false,
    });
  }
  return (
    <section className="panel account-links-panel">
      <div className="section-title">
        <Link size={16} />
        ACCOUNT LINKS
      </div>
      <h2>计费账户与工具关联</h2>
      <p className="association-note">
        <Disclosure
          summary="先归组连接，再关联工具记录"
          detail="这里的选择不会修改原始日志；切换总览账户不会更改关联。"
        />
      </p>
      {data.issue && (
        <p className="inline-warning" role="alert">
          {data.issue}
        </p>
      )}
      <h3>1. 计费账户归组</h3>
      <ul className="association-list">
        {data.groups.map((g) => (
          <li key={g.id}>
            <div>
              <strong>{g.label}</strong>
              <span>
                {providerInfo(g.provider)?.name || '连接待确认'} · {g.memberIds.length} 个连接 · 主查询：
                {accountLabel(g.primaryId)}
              </span>
              <small>{g.valid ? '人工确认属于同一账户，仅采用主查询连接的数据，不累加共享额度。' : g.message}</small>
            </div>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                setGroup({
                  ...g,
                  memberIds: g.memberIds.filter((id) => accounts.some((a) => a.id === id)),
                  confirmed: false,
                })
              }
            >
              编辑归组
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                save('removeBillingGroup', g.id, () => {
                  setGroup(newGroup());
                  setRule(newRule());
                })
              }
            >
              移除归组
            </button>
          </li>
        ))}
      </ul>
      <form
        className="association-form"
        onSubmit={(e) => {
          e.preventDefault();
          save('saveBillingGroup', group, () => setGroup(newGroup()));
        }}
      >
        <label>
          计费账户名称
          <input
            aria-label="计费账户名称"
            value={group.label}
            maxLength={80}
            required
            disabled={busy}
            onChange={(e) => setGroup({ ...group, label: e.target.value })}
            placeholder="例如：我的 Command Code 账户"
          />
        </label>
        <fieldset>
          <legend>属于此账户的连接（可多选）</legend>
          {accounts.length ? (
            accounts.map((a) => (
              <label key={a.id} className="association-check">
                <input
                  type="checkbox"
                  checked={group.memberIds.includes(a.id)}
                  disabled={busy}
                  onChange={() => toggleMember(a.id)}
                />
                <span>
                  {a.label}
                  <small>{providerInfo(a.provider)?.name}</small>
                </span>
              </label>
            ))
          ) : (
            <p>请先在上方添加平台连接。</p>
          )}
        </fieldset>
        <label>
          平台数据采用哪个连接
          <Select
            label="主查询连接"
            value={group.primaryId}
            onChange={(primaryId) => setGroup({ ...group, primaryId })}
            disabled={busy}
            options={accounts
              .filter((a) => group.memberIds.includes(a.id))
              .map((a) => ({ value: a.id, label: a.label }))}
          />
        </label>
        <label className="association-check">
          <input
            type="checkbox"
            aria-label="确认同一计费账户"
            checked={group.confirmed}
            disabled={busy}
            onChange={(e) => setGroup({ ...group, confirmed: e.target.checked })}
          />
          <span>我确认所选连接属于同一计费账户。成员或密钥变化后，原关联需重新确认。</span>
        </label>
        <div className="association-actions">
          <button className="button" type="submit" disabled={busy || !group.confirmed || !group.memberIds.length}>
            <Plus size={14} />
            {group.id ? '保存归组' : '创建计费账户组'}
          </button>
          {group.id && (
            <button className="text-button" type="button" onClick={() => setGroup(newGroup())}>
              取消编辑
            </button>
          )}
        </div>
      </form>
      <h3>2. 工具记录关联</h3>
      <ul className="association-list">
        {data.rules.map((r) => (
          <li key={r.id}>
            <div>
              <strong>
                {sourceLabel(r.sourceId)} → {data.groups.find((g) => g.id === r.groupId)?.label || '已移除账户'}
              </strong>
              <span>
                {r.provider || '全部供应商'} · {r.model || '全部模型'}
              </span>
              <small>
                {stamp(r.from)} ≤ 记录时间 {r.to ? '< ' + stamp(r.to) : '（持续生效）'} · 人工关联
              </small>
              {!r.valid && <small className="amber-text">{r.message}</small>}
            </div>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                setRule({ ...r, from: localDate(r.from), to: r.to ? localDate(r.to) : '', confirmed: false })
              }
            >
              编辑关联
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => save('removeAccountLink', r.id, () => setRule(newRule()))}
            >
              移除关联
            </button>
          </li>
        ))}
      </ul>
      <form
        className="association-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            'saveAccountLink',
            { ...rule, from: new Date(rule.from).getTime(), to: rule.to ? new Date(rule.to).getTime() : null },
            () => setRule(newRule()),
          );
        }}
      >
        <div className="association-grid">
          <label>
            工具数据源
            <Select
              label="关联工具数据源"
              value={rule.sourceId}
              onChange={(sourceId) => setRule({ ...rule, sourceId, confirmed: false })}
              disabled={busy}
              options={sources.map((s) => ({ value: s.id, label: s.label }))}
            />
          </label>
          <label>
            计费账户组
            <Select
              label="关联计费账户"
              value={rule.groupId}
              onChange={(groupId) => setRule({ ...rule, groupId, confirmed: false })}
              disabled={busy}
              options={data.groups.filter((g) => g.valid).map((g) => ({ value: g.id, label: g.label }))}
            />
          </label>
          <label>
            生效时间（本机时区）
            <input
              aria-label="关联生效时间"
              type="datetime-local"
              step="0.001"
              required
              value={rule.from}
              disabled={busy}
              onChange={(e) => setRule({ ...rule, from: e.target.value, confirmed: false })}
            />
          </label>
          <label>
            结束时间（留空则持续）
            <input
              aria-label="关联结束时间"
              type="datetime-local"
              step="0.001"
              value={rule.to}
              disabled={busy}
              onChange={(e) => setRule({ ...rule, to: e.target.value, confirmed: false })}
            />
          </label>
          <label>
            供应商标识（可选，精确匹配）
            <input
              aria-label="关联供应商"
              value={rule.provider}
              maxLength={2048}
              disabled={busy}
              onChange={(e) => setRule({ ...rule, provider: e.target.value, confirmed: false })}
              placeholder="留空包含全部；可在模型排行查看标识"
            />
          </label>
          <label>
            模型名称（可选，精确匹配）
            <input
              aria-label="关联模型"
              value={rule.model}
              maxLength={2048}
              disabled={busy}
              onChange={(e) => setRule({ ...rule, model: e.target.value, confirmed: false })}
              placeholder="留空包含全部模型"
            />
          </label>
        </div>
        <label className="association-check">
          <input
            type="checkbox"
            aria-label="确认工具记录归属"
            checked={rule.confirmed}
            disabled={busy}
            onChange={(e) => setRule({ ...rule, confirmed: e.target.checked })}
          />
          <span>
            我确认该来源在此时间和筛选范围内的记录都属于所选账户。留空条件会包含全部供应商或模型，请按实际使用范围确认。
          </span>
        </label>
        <div className="association-actions">
          <button
            className="button"
            type="submit"
            disabled={busy || !rule.confirmed || !rule.sourceId || !rule.groupId}
          >
            <Link size={14} />
            {rule.id ? '保存关联' : '添加关联'}
          </button>
          {rule.id && (
            <button className="text-button" type="button" onClick={() => setRule(newRule())}>
              取消编辑
            </button>
          )}
        </div>
      </form>
      <p className="association-note">
        <Disclosure
          summary="新增关联从当前时间开始"
          detail="要关联历史记录，请明确修改开始时间。文件替换、密钥变化、归组成员调整会要求重新确认；不能只凭模型名自动识别计费账户。"
        />
      </p>
    </section>
  );
}
export function ReconciliationPage({ state, bridge, onSettings }) {
  const groups = state.associations?.groups || [],
    [groupId, setGroupId] = useState(''),
    [range, setRange] = useState('today');
  if (!groups.some((g) => g.id === groupId) && groupId !== (groups[0]?.id || '')) {
    setGroupId(groups[0]?.id || '');
    setRange('today');
  }
  const group = groups.find((g) => g.id === groupId),
    canBill = !!group?.valid && !!group.period;
  if (range === 'billing' && !canBill) setRange('today');
  const analysis = useAnalytics(bridge, { source: 'reconciliation', groupId, range }, state, !!groupId),
    r = analysis.report,
    p = r?.platform,
    t = r?.tools,
    s = t?.summary,
    view = coverageReport(r),
    span = (start, end) => (start === null ? '—' : `${stamp(start)} — ${end === null ? '—' : stamp(end)}`);
  return (
    <div className="reconciliation-page">
      <div className="reconciliation-toolbar">
        <Select
          label="计费账户"
          value={groupId}
          onChange={(id) => {
            setGroupId(id);
            setRange('today');
          }}
          options={groups.map((g) => ({
            value: g.id,
            label: g.label,
            description: g.valid ? '人工归组 · 采用一个主查询连接' : g.message,
          }))}
        />
        <RangeControl
          value={range}
          onChange={setRange}
          billingAvailable={canBill}
          billingUnavailableReason="所选计费账户尚未提供有效账期"
        />
        <button className="button" disabled={analysis.loading || !groupId} onClick={analysis.refresh}>
          <ArrowClockwise size={14} />
          {analysis.loading ? '读取中' : '刷新报告'}
        </button>
        <button className="text-button" onClick={onSettings}>
          管理账户关联
        </button>
      </div>
      {!groups.length ? (
        <div className="panel reconciliation-empty">
          <Link size={24} />
          <h2>先建立计费账户关联</h2>
          <p>手动确认同账户的连接和工具记录范围后，再查看覆盖范围。</p>
          <button className="button" onClick={onSettings}>
            前往设置
          </button>
        </div>
      ) : (
        <>
          <section className="panel reconciliation-result">
            <div className="section-title">
              <ListChecks size={16} />
              COVERAGE REPORT
            </div>
            <h2>
              {analysis.loading
                ? '正在读取覆盖范围'
                : !r
                  ? '尚无报告'
                  : view.gapCount
                    ? `${view.sources.length} 个来源 · ${view.gapCount} 处覆盖缺口`
                    : `${view.sources.length} 个来源 · 未发现来源缺口`}
            </h2>
            <p>
              {view.range.start !== null ? span(view.range.start, view.range.end) : '请选择报告范围'} ·
              覆盖范围是本机观察到的范围，不是完整账单
            </p>
            {analysis.error && <p role="alert">{analysis.error}</p>}
            {view.available ? (
              <div className="reconciliation-difference">
                <span>
                  差值 <b>{number(view.comparison.difference)}</b>
                </span>
                <span>
                  误差率 <b>{view.comparison.errorRate !== null ? number(view.comparison.errorRate) + '%' : '—'}</b>
                </span>
              </div>
            ) : (
              r && <h3 className="coverage-subhead">暂不能计算差值：</h3>
            )}
            <ul>
              {view.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
          <section className="panel reconciliation-coverage">
            <h2>工具来源覆盖</h2>
            {view.sources.map((source) => (
              <div key={source.id} className="coverage-source">
                <div className="coverage-source-head">
                  <strong>{source.label}</strong>
                  <span>{span(source.start, source.end)}</span>
                </div>
                {source.gaps.length ? (
                  <ul>
                    {source.gaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                ) : (
                  <small>所选范围内未发现此来源的缺口；仍不能证明覆盖了其他设备或工具。</small>
                )}
              </div>
            ))}
            {!view.sources.length && <p>尚无可用于当前范围的工具来源。</p>}
          </section>
          <section className="panel reconciliation-coverage coverage-associations">
            <h2>关联状态</h2>
            <dl>
              <div>
                <dt>已关联</dt>
                <dd>{view.association ? number(view.association.linked) : '—'}</dd>
              </div>
              <div>
                <dt>未关联</dt>
                <dd>{view.association ? number(view.association.unlinked) : '—'}</dd>
              </div>
              <div>
                <dt>有歧义</dt>
                <dd>{view.association ? number(view.association.ambiguous) : '—'}</dd>
              </div>
              <div>
                <dt>已失效</dt>
                <dd>{view.association ? number(view.association.invalid) : '—'}</dd>
              </div>
            </dl>
            <p>
              <Disclosure
                summary="只有确认过的规则才会归入此账户"
                detail="数字是记录条数。有歧义或已失效的记录不归入任何账户。"
              />
            </p>
            {r?.rules?.map((rule) => (
              <p key={rule.id}>
                {state.toolSources?.find((s) => s.id === rule.sourceId)?.label || '已移除来源'} ·{' '}
                {rule.provider || '全部供应商'} / {rule.model || '全部模型'} · {stamp(rule.from)} 至{' '}
                {rule.to ? stamp(rule.to) : '持续生效'} · {rule.valid ? '人工确认' : rule.message}
              </p>
            ))}
          </section>
          <div className="reconciliation-grid">
            <section className="panel">
              <h2>平台数据 · 仅一个查询来源</h2>
              <p>
                {p?.connectionLabel || group?.label} · {p?.memberCount || group?.memberIds.length || 0} 个连接共享此归组
              </p>
              <small>
                查询时间：{stamp(p?.updatedAt)} · {p?.status === 'connected' ? '已同步' : '未同步或上次数据'}
              </small>
              {p?.kind === 'summary' ? (
                <>
                  <dl>
                    <div>
                      <dt>平台 Token 汇总</dt>
                      <dd>{number(p.summary.total)}</dd>
                    </div>
                    <div>
                      <dt>平台返回费用 · USD</dt>
                      <dd>{number(p.summary.cost)}</dd>
                    </div>
                  </dl>
                  <p>
                    平台范围：{stamp(p.summary.period.start)} — {stamp(p.summary.period.end)}
                    。未对齐所选范围时仅供参考。
                  </p>
                </>
              ) : p?.kind === 'balance' ? (
                <dl>
                  {p.balance.balances.map((b) => (
                    <div key={b.currency}>
                      <dt>可用余额 · {b.currency}</dt>
                      <dd>{formatAmount(b.total)}</dd>
                    </div>
                  ))}
                </dl>
              ) : p?.kind === 'quota' ? (
                <p>此平台提供套餐额度；请在对应连接总览查看窗口。没有可直接核对的 Token 或实际账单。</p>
              ) : (
                <p>平台数据尚不可用。</p>
              )}
              <p className="association-note">组内连接不相加，也不与右侧工具明细相加。</p>
            </section>
            <section className="panel">
              <h2>工具记录 · 人工关联范围</h2>
              <dl>
                <div>
                  <dt>已知 Token</dt>
                  <dd>{number(s?.knownTokens)}</dd>
                </div>
                <div>
                  <dt>已关联记录</dt>
                  <dd>{number(t?.association?.linkedRecords)}</dd>
                </div>
                <div>
                  <dt>缺少完整用量</dt>
                  <dd>{number(s?.missingTokenRequests)}</dd>
                </div>
              </dl>
              <p>费用仅按本机单价估算，不能冒充平台实际费用。</p>
              {Object.entries(s?.costsByCurrency || {}).map(([currency, c]) => (
                <p key={currency}>
                  {currency} 已知估算费用：{number(c.knownCost)}
                  {c.partial ? ' · 仅已定价部分' : ''}
                </p>
              ))}
              <small>工具同步时间：{stamp(t?.updatedAt)}</small>
            </section>
          </div>
        </>
      )}
      <p className="association-note">
        <Info size={14} />
        <Disclosure
          summary="不同口径的数据不相加、不比较"
          detail="余额、额度百分比、工具 Token 与估算费用口径不同。只有账户、区间、单位、口径、覆盖和新鲜度全部对齐时才显示差值。"
        />
      </p>
    </div>
  );
}
