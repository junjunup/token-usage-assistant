import React, { useEffect, useState } from 'react';
import { ShieldCheck, Clock, Info, Key, Plug, SignOut, ArrowUpRight, WarningCircle } from '@phosphor-icons/react';
import { Select } from './Select.jsx';
import { Live } from './Live.jsx';
import { PROVIDERS, providerInfo } from './generated/provider-catalog.js';
import { quotaStatus, resetDescription } from './generated/domain.js';
import './providers.css';
const number = (v) => typeof v === 'number' && Number.isFinite(v);
const format = (v) => (number(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '—');
const toneFor = (w, threshold) =>
  w.exceeded ? 'red' : number(w.remainingPercent) && w.remainingPercent < threshold ? 'amber' : 'green';
// T6.1: how far each platform has been checked (registry `verification`), shown next to its name.
const VERIFICATION = {
  live: { text: '已实测', title: '用真实账户只读验证过' },
  contract: { text: '样例验证', title: '只用官方接口样例测试过' },
  experimental: { text: '实验', title: '实验性支持' },
};
export function verificationBadge(provider) {
  const v = providerInfo(provider)?.verification;
  const label = v && VERIFICATION[v.level];
  return label ? { text: label.text, tone: v.level } : null;
}
export function Bar({ value, label, tone = 'green', small = false }) {
  const length = small ? 20 : 32,
    clamped = number(value) ? Math.max(0, Math.min(100, value)) : null;
  return (
    <div
      className={'segments ' + tone + (small ? ' small' : '') + (clamped === null ? ' unknown' : '')}
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={clamped === null ? '暂不可获取' : format(value) + '%'}
    >
      {Array.from({ length }, (_, i) => (
        <span key={i} className={clamped !== null && i < Math.round((clamped / 100) * length) ? 'filled' : ''} />
      ))}
    </div>
  );
}
function metric(w, used = false) {
  return w.applicable === false
    ? '未包含'
    : w.unlimited
      ? '不限'
      : format(used ? w.usedPercent : w.remainingPercent) +
        (number(used ? w.usedPercent : w.remainingPercent) ? '%' : '');
}
function reset(w, now) {
  return w.applicable === false ? '当前套餐不含此额度' : resetDescription(w, now);
}
function usage(w) {
  if (w.applicable === false) return '此模型未包含在当前套餐中';
  if (w.unlimited) return '平台明确返回不设此窗口限制';
  if (number(w.used) && number(w.cap)) return '已用 ' + format(w.used) + ' / ' + format(w.cap) + ' ' + w.unit;
  return number(w.remainingPercent) ? '平台提供百分比，未提供可核对的总量' : '此窗口额度暂不可获取';
}
export function AccountSwitcher({ state, onSelect, onManage }) {
  const accounts = state.accounts || [];
  return (
    <div className="account-switcher">
      <div>
        <span className="micro-label">CURRENT ACCOUNT / 当前账户</span>
        {accounts.length ? (
          <Select
            label="切换监测账户"
            value={state.activeAccountId}
            disabled={state.connecting}
            onChange={onSelect}
            menuWidth={350}
            options={accounts.map((a) => ({
              value: a.id,
              label: a.label,
              badge: verificationBadge(a.provider),
              description:
                (providerInfo(a.provider)?.name || a.provider) +
                ' · ' +
                (providerInfo(a.provider)?.regions.find((r) => r.id === a.region)?.name || a.region) +
                (a.status === 'auth-error' ? ' · 需要重新连接' : a.status === 'offline' ? ' · 连接中断' : ''),
            }))}
          />
        ) : (
          <strong>尚未添加账户</strong>
        )}
      </div>
      <span className="account-monitor-note">
        {accounts.length ? '已保存 ' + accounts.length + ' 个账户 · 独立刷新与提醒' : '选择平台后在本机连接'}
      </span>
      <button className="button" onClick={onManage}>
        管理连接
        <ArrowUpRight size={14} />
      </button>
    </div>
  );
}
export function ProviderDashboard({ state, onSettings }) {
  const [used, setUsed] = useState(false),
    c = state.data.parts.credits,
    info = providerInfo(state.provider),
    account = state.accounts?.find((a) => a.id === state.activeAccountId);
  const [baseStatus, baseTone] = quotaStatus(state),
    windows = c?.windows || [],
    stale = state.data.status !== 'connected';
  const status = state.connectionStatus?.quota.label || baseStatus,
    tone = state.connectionStatus?.quota.status === 'waiting' ? 'neutral' : baseTone;
  return (
    <div className="provider-dashboard">
      <div className="account-line">
        <span>
          <span className={'status-dot ' + tone} />
          {account?.label || info?.name} · 套餐额度
        </span>
        <span>{c?.planName || info?.name}</span>
      </div>
      <LocalConnectionStatus state={state} />
      {(state.data.errors.length > 0 || state.credentialIssue) && (
        <div className="inline-warning" role="status">
          <WarningCircle size={17} />
          <span>
            {state.credentialIssue || state.data.errors[0].message}
            {windows.length ? ' 当前显示上次成功数据。' : ''}
          </span>
          {state.data.status === 'auth-error' && (
            <button onClick={onSettings}>
              重新连接
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      )}
      <section className="panel provider-quota-panel">
        <div className="panel-heading">
          <div className="section-title green-text">
            <ShieldCheck size={16} />
            <span>
              PLAN QUOTAS <span className="label-cn">/ 套餐额度</span>
            </span>
          </div>
          <span className={'status-tag ' + tone}>{status}</span>
        </div>
        <div className="quota-subhead">
          <span>
            {stale && windows.length ? '上次数据 · ' : '各窗口分别计算 · '}
            {windows.length + ' 个额度窗口'}
          </span>
          <div className="segmented-control" aria-label="额度显示方式">
            <button className={!used ? 'selected' : ''} aria-pressed={!used} onClick={() => setUsed(false)}>
              剩余
            </button>
            <button className={used ? 'selected' : ''} aria-pressed={used} onClick={() => setUsed(true)}>
              已用
            </button>
          </div>
        </div>
        <div className="provider-quota-grid">
          {windows.map((w) => (
            <section className="quota-row" key={w.id}>
              <div className="quota-top">
                <div>
                  <div className="micro-label provider-group">{w.group}</div>
                  <h2>{w.label}</h2>
                </div>
                <div className={'quota-number ' + toneFor(w, state.settings.threshold) + '-text'}>
                  <strong>{metric(w, used)}</strong>
                  <span className="remaining-label">
                    {w.applicable === false ? '套餐权益' : w.unlimited ? '额度' : used ? '已用' : '剩余'}
                  </span>
                </div>
              </div>
              <Bar
                value={used ? w.usedPercent : w.remainingPercent}
                label={w.group + ' ' + w.label + (used ? '已用' : '剩余')}
                tone={toneFor(w, state.settings.threshold)}
              />
              <div className="quota-meta">
                <span>{usage(w)}</span>
                <span title={w.resetAt ? new Date(w.resetAt).toLocaleString('zh-CN') : undefined}>
                  <Clock size={13} />
                  <b className="mono">
                    <Live>{(now) => reset(w, now)}</Live>
                  </b>
                </span>
              </div>
              {w.boost !== 1 && (
                <p className="quota-boost">剩余百分比含平台加赠倍率 ×{format(w.boost)}；已用比例按基础额度显示。</p>
              )}
            </section>
          ))}
        </div>
        {!windows.length && (
          <div className="provider-empty">
            <ShieldCheck size={28} />
            <p>
              {state.data.fetching
                ? '正在读取套餐额度…'
                : state.connectionStatus?.quota.message || '暂时没有可展示的额度，连接成功后在这里显示。'}
            </p>
          </div>
        )}
        <p className="analysis-note">
          额度观察时间：
          {state.data.updatedAt.credits
            ? new Date(state.data.updatedAt.credits).toLocaleString('zh-CN')
            : '等待首条数据'}
          {state.data.status === 'stale' && state.data.updatedAt.credits ? ' · 最近观察值，尚未确认当前额度' : ''}
        </p>
        <div className="quota-footer">
          <Info size={14} />
          <span>{c?.note || info?.note}</span>
        </div>
      </section>
      <div className="provider-data-note">
        <Info size={16} />
        <p>此连接显示官方套餐额度。Token 明细与实际费用未通过此额度接口提供；工具分析是独立来源。</p>
      </div>
    </div>
  );
}
export function ProviderWidget({ state }) {
  const c = state.data.parts.credits,
    windows = c?.windows || [],
    account = state.accounts?.find((a) => a.id === state.activeAccountId);
  const sorted = [...windows].sort(
    (a, b) =>
      Number(a.applicable === false) - Number(b.applicable === false) ||
      (a.remainingPercent ?? 101) - (b.remainingPercent ?? 101),
  );
  const shown = state.settings.widgetExpanded ? windows : sorted.slice(0, 2);
  return (
    <>
      <div className="provider-widget-account">
        <strong>{account?.label || providerInfo(state.provider)?.name}</strong>
        <small>
          {!windows.length && state.connectionStatus
            ? state.connectionStatus.quota.label
            : state.data.status === 'stale'
              ? '最近观察值 · 等待新数据'
              : state.settings.widgetExpanded
                ? '全部额度窗口'
                : '优先显示剩余较低的窗口'}
        </small>
      </div>
      {shown.map((w) => (
        <section className="provider-widget-quota" key={w.id}>
          <div className="widget-row">
            <span>
              {w.label}
              <span className="micro-label">{w.group}</span>
            </span>
            <strong className="mono">{metric(w)}</strong>
          </div>
          <Bar
            value={w.remainingPercent}
            small
            label={w.group + ' ' + w.label + '剩余'}
            tone={toneFor(w, state.settings.threshold)}
          />
          <div className="widget-reset">
            <Clock size={12} />
            <Live>{(now) => reset(w, now)}</Live>
          </div>
          {state.settings.widgetExpanded && <small className="widget-synced">{usage(w)}</small>}
        </section>
      ))}
      {!windows.length && <p className="provider-empty">等待额度同步</p>}
      {!state.settings.widgetExpanded && windows.length > 2 && (
        <small className="widget-synced">展开查看全部 {windows.length} 个窗口</small>
      )}
    </>
  );
}
export function LocalConnectionStatus({ state }) {
  if (!state.connectionStatus) return null;
  return (
    <div className="local-connection-status" aria-label="本机连接状态">
      {[
        ['quota', '套餐额度'],
        ['details', '工具明细'],
      ].map(([key, title]) => {
        const item = state.connectionStatus[key];
        return (
          <div key={key}>
            <span className="micro-label">{title}</span>
            <strong>
              <span
                className={
                  'status-dot ' + (item.status === 'synced' ? 'green' : item.status === 'error' ? 'amber' : 'neutral')
                }
              />
              {item.label}
            </strong>
            <p>{item.message}</p>
          </div>
        );
      })}
    </div>
  );
}
export function ConnectionForm({ state, preview, action, onConnected, onRemove }) {
  const active = state.accounts?.find((a) => a.id === state.activeAccountId);
  const [mode, setMode] = useState('add'),
    [provider, setProvider] = useState('glm'),
    [region, setRegion] = useState('cn'),
    [label, setLabel] = useState(''),
    [apiKey, setKey] = useState(''),
    [accessKeyId, setAk] = useState(''),
    [secretKey, setSk] = useState(''),
    [orgId, setOrg] = useState('');
  const [pending, setPending] = useState(false),
    [profiles, setProfiles] = useState(null),
    [profileId, setProfileId] = useState('');
  const info = providerInfo(provider),
    busy = state.connecting || pending;
  function clearProfiles() {
    setProfiles(null);
    setProfileId('');
  }
  function clear() {
    setKey('');
    setAk('');
    setSk('');
  }
  function changeProvider(id) {
    setProvider(id);
    setRegion(providerInfo(id).regions[0].id);
    setOrg('');
    clear();
    clearProfiles();
  }
  function chooseMode(value) {
    setMode(value);
    clear();
    clearProfiles();
    if (value === 'update' && active) {
      setProvider(active.provider);
      setRegion(active.region);
      setLabel(active.label);
      setOrg(active.orgId || '');
    } else {
      setLabel('');
      setOrg('');
    }
  }
  const [formAccount, setFormAccount] = useState(state.activeAccountId);
  if (formAccount !== state.activeAccountId) {
    setFormAccount(state.activeAccountId);
    setMode('add');
    setLabel('');
    setOrg('');
    clear();
    clearProfiles();
  }
  async function submit(e, manual = false) {
    e.preventDefault();
    if (busy) return;
    setPending(true);
    const input = {
      provider,
      region,
      label,
      apiKey,
      accessKeyId,
      secretKey,
      orgId,
      ...(mode === 'update' ? { accountId: state.activeAccountId } : {}),
      ...(provider === 'codex' ? { manual, ...(!manual && profileId ? { profileId } : {}) } : {}),
    };
    clear();
    try {
      const result = await action(input);
      if (result?.needsProfileSelection) {
        setProfiles(result);
        setProfileId('');
      } else if (result && !result.cancelled) {
        clearProfiles();
        onConnected();
      }
    } finally {
      setPending(false);
    }
  }
  const hasSecret =
    info.credential === 'local'
      ? true
      : info.credential === 'aksk'
        ? !!accessKeyId.trim() && !!secretKey.trim()
        : !!apiKey.trim();
  return (
    <section className="panel connection-panel">
      <div className="section-title">
        <Key size={16} />
        ACCOUNT CONNECTION
      </div>
      <div className="connection-status">
        <span className={'status-dot ' + (state.hasCredential ? 'green' : 'neutral')} />
        {active ? '当前连接 · ' + active.label : '添加官方套餐或按量账户'}
      </div>
      <LocalConnectionStatus state={state} />
      <form onSubmit={submit}>
        <div className="connection-selectors">
          {active && (
            <label>
              连接操作
              <Select
                label="连接操作"
                value={mode}
                onChange={chooseMode}
                disabled={busy}
                options={[
                  { value: 'add', label: '添加新连接' },
                  { value: 'update', label: '更新当前连接' },
                ]}
              />
            </label>
          )}
          <label>
            平台
            <Select
              label="选择平台"
              value={provider}
              onChange={changeProvider}
              disabled={busy || mode === 'update'}
              options={PROVIDERS.map((p) => ({ value: p.id, label: p.name, badge: verificationBadge(p.id) }))}
            />
          </label>
          <label>
            地区
            <Select
              label="选择地区"
              value={region}
              onChange={(v) => {
                setRegion(v);
                clear();
              }}
              disabled={busy || mode === 'update'}
              options={info.regions.map((r) => ({ value: r.id, label: r.name }))}
            />
          </label>
        </div>
        <p className="provider-form-note">{info.note}</p>
        {info.verification && (
          <p className="provider-verification">
            <em className={'ui-select-badge ' + info.verification.level}>{verificationBadge(provider)?.text}</em>
            {info.verification.note}（{info.verification.date}）
          </p>
        )}
        <label htmlFor="account-label">
          账户备注 <span>可选，方便区分多个连接</span>
        </label>
        <input
          id="account-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder={info.name}
          disabled={busy}
        />
        {info.credential === 'local' ? (
          <div className="analysis-callout">
            <Info size={17} />
            <span>
              {provider === 'codex'
                ? '自动识别已保存配置、CODEX_HOME 与本机默认目录，通过官方客户端读取当前登录订阅。多个配置时可选择；也可手动指定目录。套餐额度与工具明细分别显示状态。'
                : '点击连接后生成本地启动配置和 Claude Code 数据源。请在项目目录运行生成的 ' +
                  (state.platform === 'darwin' ? 'Start-Claude.command' : 'Start-Claude.ps1') +
                  '；助手运行时采集，原 Claude 配置文件保留。需要 Claude Code 2.1.251+（2.1.x）。'}
            </span>
          </div>
        ) : info.credential === 'aksk' ? (
          <>
            <label htmlFor="access-key-id">Access Key ID</label>
            <input
              id="access-key-id"
              type="password"
              value={accessKeyId}
              onChange={(e) => setAk(e.target.value)}
              disabled={busy || preview}
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              maxLength={4096}
            />
            <label htmlFor="secret-access-key">Secret Access Key</label>
            <input
              id="secret-access-key"
              type="password"
              value={secretKey}
              onChange={(e) => setSk(e.target.value)}
              disabled={busy || preview}
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              maxLength={4096}
            />
          </>
        ) : (
          <>
            <label htmlFor="api-key">{info.name} API Key</label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setKey(e.target.value)}
              disabled={busy || preview}
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              maxLength={4096}
              placeholder={
                info.capabilities.balance && !info.capabilities.quota ? '在本机粘贴官方 API Key' : '在本机粘贴套餐密钥'
              }
            />
          </>
        )}
        {provider === 'commandcode' && (
          <>
            <label htmlFor="org-id">
              组织 ID <span>可选</span>
            </label>
            <input
              id="org-id"
              value={orgId}
              onChange={(e) => setOrg(e.target.value)}
              maxLength={128}
              disabled={busy || preview}
            />
          </>
        )}
        {provider === 'codex' && profiles && (
          <div className="codex-profile-choice">
            <p role="status">{profiles.message}</p>
            <Select
              label="选择 Codex 配置"
              value={profileId}
              onChange={setProfileId}
              disabled={busy}
              menuWidth={520}
              options={profiles.profiles.map((p) => ({ value: p.id, label: p.label, description: p.home }))}
            />
            <small>确认所选位置后读取登录状态；配置位置不代表已登录账户。</small>
          </div>
        )}
        <p className="credential-note">
          <ShieldCheck size={14} />
          凭据使用{state.platform === 'darwin' ? ' macOS 钥匙串' : ' Windows 系统加密'}保存在本机，仅用于官方只读查询。
        </p>
        <div className="connect-actions">
          <button
            className="button primary"
            type="submit"
            disabled={
              !hasSecret ||
              busy ||
              preview ||
              !!state.credentialIssue ||
              (provider === 'codex' && !!profiles && !profileId)
            }
          >
            <Plug size={15} />
            {busy
              ? '正在验证连接'
              : provider === 'claude'
                ? '连接并生成采集配置'
                : provider === 'codex'
                  ? profiles
                    ? '连接所选配置'
                    : '连接本机 Codex'
                  : mode === 'update'
                    ? '验证并更新连接'
                    : '验证并添加账户'}
          </button>
          {provider === 'codex' && (
            <button
              className="button"
              type="button"
              disabled={busy || preview || !!state.credentialIssue}
              onClick={(e) => submit(e, true)}
            >
              手动选择目录
            </button>
          )}
          {active && (
            <button className="text-button disconnect" type="button" disabled={busy} onClick={onRemove}>
              <SignOut size={14} />
              移除当前连接
            </button>
          )}
        </div>
      </form>
      {state.credentialIssue && <p className="form-error">{state.credentialIssue}</p>}
    </section>
  );
}
