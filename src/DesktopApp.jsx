import React, { useEffect, useRef, useState } from 'react';
import { Disclosure } from './Disclosure.jsx';
import {
  ChartBar,
  ArrowsClockwise,
  GearSix,
  ArrowUpRight,
  PushPin,
  X,
  Minus,
  Clock,
  ShieldCheck,
  Lightning,
  Coins,
  Check,
  Bell,
  CaretDown,
  CaretRight,
  Info,
  Sun,
  Moon,
  ArrowSquareOut,
  SquaresFour,
  Square,
  Key,
  Plug,
  SignOut,
  WarningCircle,
  ArrowsLeftRight,
  FileArrowDown,
  AppWindow,
  Folder,
} from '@phosphor-icons/react';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import { previewBridge } from './desktop-preview.js';
import { BrandMark } from './BrandMark.jsx';
import './desktop.css';
import { Select } from './Select.jsx';
import { Live } from './Live.jsx';
import { BalanceDashboard, BalanceWidget } from './BalanceViews.jsx';
import { AccountSwitcher, ProviderDashboard, ProviderWidget, ConnectionForm } from './ProviderViews.jsx';
import { monthlyQuota, quotaStatus, resetDescription } from './generated/domain.js';
import { useAnalytics } from './useAnalytics.js';
import { AnalyticsPage, RangeControl, HealthStrip } from './AnalyticsPage.jsx';
import { ToolSources } from './ToolSources.jsx';
import { AccountLinks, ReconciliationPage } from './AccountLinks.jsx';
import { AllAccountsGrid, GlanceWidget, attentionText } from './AccountsOverview.jsx';
import { PaceLine } from './Panel.jsx';
import { paceLine } from './generated/menubar-panel.js';
import { AdvancedSettings, SetupHeading, SetupWizard } from './Onboarding.jsx';
import { wizardPending } from './generated/onboarding.js';
import { t, locale, setLanguage, resolveLanguage } from './i18n.js';

const bridge = window.tokenAssistant || previewBridge;
// T12.6: tools with data at their default location (module-level, so the lists fetch once per change of sources).
const discoverTools = () => bridge.discoverTools?.() ?? Promise.resolve(null);
const browserPreview = !window.tokenAssistant;
const widget = new URLSearchParams(location.search).get('surface') === 'widget';
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const compact = (v) =>
  num(v) ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : '—';
const currency = (v) =>
  num(v)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
    : '—';
const fullNumber = (v) => (num(v) ? v.toLocaleString('en-US') : '—');
const pct = (v) =>
  num(v) ? (v > 0 && v < 0.1 ? '<0.1' : v.toLocaleString('en-US', { maximumFractionDigits: 1 })) : '—';
const time = (v) => (v ? new Date(v).toLocaleTimeString(locale(), { hour12: false }) : t('尚未同步'));
const date = (v) => (v ? new Date(v).toLocaleDateString(locale(), { month: '2-digit', day: '2-digit' }) : '—');

function IconButton({ label, children, className = '', ...props }) {
  return (
    <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
function Section({ icon: Icon, children, tone = '' }) {
  return (
    <div className={`section-title ${tone}`}>
      <Icon size={16} />
      <span>{children}</span>
    </div>
  );
}
function Toggle({ label, checked, onChange, disabled = false }) {
  return (
    <button
      className={`toggle ${checked ? 'on' : ''}`}
      role="switch"
      type="button"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
// T7.7: menu-bar icon and popover panel settings (macOS only). Defaults: form ②, usage on, alert colours on,
// panel protection on. When the system hides the icon next to the notch we only say so; the form never changes by
// itself (user decision, 2026-10-18).
const MENUBAR_FORMS = [
  { value: 'ring', label: '① 只有刻度环' },
  { value: 'value', label: '② 刻度环 + 数值' },
  { value: 'two', label: '③ 两行小字' },
];
// T12.8: what the update note says while the installed Windows build downloads and installs a new version.
const UPDATE_ERRORS = {
  'not-found': '这个版本在安装包仓库里没有自动更新文件，请到发布页手动下载。',
  integrity: '下载的安装包与校验值不一致，已放弃，请到发布页手动下载。',
  failed: '下载没有完成，请检查网络后重试，或到发布页手动下载。',
};
function UpdateNote({ update, current, action }) {
  const install = update.install,
    button = (label, Icon, run) => (
      <button className="text-button" onClick={() => action(run)}>
        {label}
        <Icon size={13} />
      </button>
    );
  if (install?.status === 'checking')
    return (
      <>
        {t('正在查找')} {update.version} {t('的安装包…')}
      </>
    );
  if (install?.status === 'downloading')
    return (
      <>
        {t('正在下载')} {install.version}
        {num(install.percent) ? t('（{v0}%）', { v0: install.percent }) : '…'}
      </>
    );
  if (install?.status === 'ready')
    return (
      <>
        {install.version} {t('已下载并核对')}
        <span className="update-actions">{button(t('重启并安装'), ArrowsClockwise, () => bridge.installUpdate())}</span>
      </>
    );
  return (
    <>
      {t('发现新版本')} {update.version} {t('· 当前')} {current}
      <span className="update-actions">
        {install &&
          button(install.status === 'failed' ? t('重新下载') : t('下载并安装'), FileArrowDown, () =>
            bridge.downloadUpdate(),
          )}
        {button(t('查看新版本'), ArrowSquareOut, () => bridge.openUpdate())}
      </span>
      {install?.status === 'failed' && (
        <span className="update-error red-text">{t(UPDATE_ERRORS[install.error] || UPDATE_ERRORS.failed)}</span>
      )}
    </>
  );
}
// T7.7 (macOS menu bar); T11.2: the same settings for the Windows tray, without the icon form (ring only there).
// T14.2 (D21): reminder amounts for balance accounts, per currency (never converted). Saved when the field loses
// focus or Enter is pressed; empty = no reminder (only the platform's own "unavailable" flag).
const AMOUNT = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/;
function BalanceThresholds({ settings, pref }) {
  const [draft, setDraft] = useState({ CNY: settings.balanceThresholdCNY, USD: settings.balanceThresholdUSD });
  const [error, setError] = useState('');
  const save = (currency) => {
    const value = draft[currency].trim();
    if (value === settings['balanceThreshold' + currency]) return setError('');
    if (value && !AMOUNT.test(value)) return setError(t('请填写不超过两位小数的金额，留空表示不提醒。'));
    setError('');
    pref({ ['balanceThreshold' + currency]: value });
  };
  return (
    <div className="setting-row balance-threshold-row">
      <div>
        <h2>{t('余额提醒金额')}</h2>
        <p>{t('按量余额低于这个金额时变色并通知；人民币和美元分开设置，不换汇。留空表示不提醒。')}</p>
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="balance-threshold-inputs">
        {[
          ['CNY', '¥'],
          ['USD', '$'],
        ].map(([currency, symbol]) => (
          <label key={currency}>
            <span className="mono">{symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder={t('不提醒')}
              aria-label={currency + t(' 余额提醒金额')}
              value={draft[currency]}
              onChange={(e) => setDraft({ ...draft, [currency]: e.target.value })}
              onBlur={() => save(currency)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
function MenubarSettings({ state, settings, pref, mac }) {
  const usage = settings.menubarUsage !== false;
  const place = mac ? t('菜单栏') : t('托盘');
  return (
    <div className="menubar-settings" id="menubar-settings">
      <div className="settings-subhead">
        <AppWindow size={15} />
        {place}
        {t('图标与面板')}
      </div>
      {!mac && (
        <p className="menubar-settings-note">
          {t(
            '托盘图标只画刻度环：亮起的部分是剩余最少的账户窗口，悬停可看各账户的数值，左键打开用量面板。Windows 可能把它收在任务栏的「^」里，想一直显示：任务栏设置 → 其他系统托盘图标（Windows 10 为「选择哪些图标显示在任务栏上」），打开「Token 用量助手」。',
          )}
        </p>
      )}
      {mac && state.menubar?.hidden === true && usage && (
        <div className="inline-warning" role="status">
          <WarningCircle size={16} />
          <span>{t('菜单栏空间不足，图标已被系统隐藏。可改用「① 只有刻度环」，或减少其他菜单栏图标。')}</span>
        </div>
      )}
      {mac && (
        <div className="setting-row">
          <div>
            <h2>{t('图标形态')}</h2>
            <p>
              <Disclosure
                summary={t('图标显示最紧急的账户窗口')}
                detail={t(
                  '① 约 34pt 宽；② 约 60–95pt、③ 约 75–100pt，随数值长短变化；放不下时系统会把图标藏到刘海后面。',
                )}
              />
            </p>
          </div>
          <Select
            label={t('菜单栏图标形态')}
            value={settings.menubarForm || 'value'}
            disabled={!usage}
            onChange={(value) => pref({ menubarForm: value })}
            menuWidth={180}
            options={MENUBAR_FORMS.map((o) => ({ ...o, label: t(o.label) }))}
          />
        </div>
      )}
      <div className="setting-row">
        <div>
          <h2>
            {place}
            {t('显示用量')}
          </h2>
          <p>
            {t('关闭后')}
            {place}
            {t('只显示静态 Logo，适合屏幕共享或演示；')}
            {place}
            {t('图标不受截屏保护。')}
          </p>
        </div>
        <Toggle label={place + t('显示用量')} checked={usage} onChange={(v) => pref({ menubarUsage: v })} />
      </div>
      <div className="setting-row">
        <div>
          <h2>{t('告警时变色')}</h2>
          <p>
            {mac
              ? t('剩余低于提醒阈值时显示琥珀色，额度用尽时显示红色；关闭后始终单色。')
              : t('剩余低于提醒阈值时整个刻度环带琥珀色，额度用尽时整环变红；关闭后始终单色。')}
          </p>
        </div>
        <Toggle
          label={t('告警时变色')}
          checked={settings.menubarAlertColor !== false}
          disabled={!usage}
          onChange={(v) => pref({ menubarAlertColor: v })}
        />
      </div>
      <div className="setting-row">
        <div>
          <h2>{t('面板截屏与共享保护')}</h2>
          <p>{t('开启后，系统截图、录屏和屏幕共享通常拍不到弹出面板；部分使用新版系统接口的软件可能例外。')}</p>
        </div>
        <Toggle
          label={t('面板截屏与共享保护')}
          checked={settings.panelProtect !== false}
          onChange={(v) => pref({ panelProtect: v })}
        />
      </div>
    </div>
  );
}
function Segments({ value, label, tone = 'green', small = false }) {
  const segments = small ? 20 : 32;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={num(value) ? value : undefined}
      aria-valuetext={num(value) ? `${pct(value)}%` : t('暂无数据')}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`segments ${tone} ${small ? 'small' : ''} ${num(value) ? '' : 'unknown'}`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={num(value) && i < Math.round((value / 100) * segments) ? 'filled' : ''}
        />
      ))}
    </div>
  );
}

// T11.1 widget status line: collapsed, how the other accounts stand; expanded, when the top account last synced.
function GlanceStatus({ overview, expanded }) {
  const [top, ...rest] = overview.rows,
    warn = rest.filter((r) => r.tone !== 'normal').length,
    level = rest.some((r) => r.tone === 'red') ? 'red' : warn ? 'amber' : '';
  return (
    <div className="widget-status">
      <span className={`status-dot ${expanded ? '' : level}`} />
      {expanded
        ? (top.stale && top.synced ? t('上次数据 · ') : '') + t('额度更新 ') + time(top.updatedAt)
        : t('另 {v0} 个账户{v1}', {
            v0: rest.length,
            v1: warn ? t('，其中 ') + attentionText(warn) : attentionText(0),
          })}
    </div>
  );
}

export function DesktopApp() {
  const [state, setState] = useState(null),
    [view, setView] = useState('overview'),
    [used, setUsed] = useState(false),
    [details, setDetails] = useState(false),
    [toast, setToast] = useState(null),
    [dialog, setDialog] = useState(null),
    [wizardOpen, setWizardOpen] = useState(false);
  const dialogRef = useRef();
  const [diagnostics, setDiagnostics] = useState('');
  const [range, setRange] = useState('today'),
    [analysisSource, setAnalysisSource] = useState('tools'),
    [sourceIds, setSourceIds] = useState([]),
    [billingGroupId, setBillingGroupId] = useState(''),
    [filters, setFilters] = useState({ model: '', project: '', session: '' });
  const balanceOnly = !!state?.capabilities?.balance && !state?.capabilities?.quota;
  const generic =
    state?.capabilities?.usageSummary === false || (!!state?.provider && state.provider !== 'commandcode');
  // Switching accounts resets the range and filters unless tool analytics is open.
  const [rangeAccount, setRangeAccount] = useState(state?.activeAccountId);
  if (rangeAccount !== state?.activeAccountId) {
    setRangeAccount(state?.activeAccountId);
    if (view !== 'analytics' || analysisSource === 'account') {
      setRange('today');
      setFilters({ model: '', project: '', session: '' });
    }
  }
  const billingGroups = state?.associations?.groups || [],
    selectedBillingGroup = billingGroups.find((g) => g.id === billingGroupId && g.valid),
    toolBillingAvailable = !!selectedBillingGroup?.period;
  if (billingGroupId && billingGroupId !== 'unlinked' && !billingGroups.some((g) => g.id === billingGroupId && g.valid))
    setBillingGroupId('');
  const analysis = useAnalytics(
    bridge,
    {
      source: view === 'analytics' ? analysisSource : 'account',
      range,
      ...(view === 'analytics' && analysisSource !== 'account' ? { ...filters, sourceIds, billingGroupId } : {}),
    },
    state,
    !widget && (view === 'analytics' || (view === 'overview' && !generic)),
  );
  const openAnalytics = () => {
    if (analysisSource !== 'account' && range === 'billing' && !toolBillingAvailable) setRange('today');
    setView('analytics');
  };
  // Drop selected sources that were removed or disabled.
  if (state?.toolSources && sourceIds.some((id) => !state.toolSources.some((s) => s.id === id && s.enabled)))
    setSourceIds(sourceIds.filter((id) => state.toolSources.some((s) => s.id === id && s.enabled)));
  // Where the next view change should land: the top, or a settings group a link points at (T7.10).
  const jumpTo = useRef(null);
  const openSettingsAt = (id) => {
    jumpTo.current = id;
    setView('settings');
  };
  useEffect(() => {
    const target = jumpTo.current && document.getElementById(jumpTo.current);
    jumpTo.current = null;
    if (target) target.scrollIntoView({ block: 'start' });
    else document.querySelector('.native-app .main-content')?.scrollTo({ top: 0 });
  }, [view]);
  useEffect(() => {
    let alive = true;
    const off = bridge.onState((s) => {
      if (alive) setState(s);
    });
    bridge.getState().then((r) => {
      if (alive && r.ok) setState(r.value);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (state) bridge.ready();
  }, [!!state]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [dialog]);
  async function action(fn, success) {
    try {
      const result = await fn();
      if (!result.ok) throw new Error(result.error);
      if (success && !result.value?.cancelled && !result.value?.needsProfileSelection)
        setToast({ title: result.value?.connectionMessage || success });
      return result.value;
    } catch (e) {
      setToast({ title: e.message || t('操作未完成'), error: true });
      return null;
    }
  }
  function pref(patch) {
    return action(() => bridge.setSettings(patch));
  }
  if (!state)
    return (
      <div className="native-loading">
        <BrandMark size={30} />
        <span>{t('正在加载用量助手…')}</span>
      </div>
    );
  // T14.4: the interface language for this render (t() reads it).
  setLanguage(resolveLanguage(state.settings.language, state.systemLanguage));
  const { settings, data } = state,
    { parts, updatedAt } = data,
    c = parts.credits,
    s = view === 'overview' && range !== 'billing' ? analysis.report?.summary : parts.summary,
    sub = parts.subscription,
    identity = parts.identity;
  // T11.4: the first-run wizard opens by itself only on a fresh start, then stays while it is used (connecting an
  // account in step 2 must not close it) until it is finished or skipped.
  if (!wizardOpen && !widget && wizardPending(state)) setWizardOpen(true);
  const setup = view === 'overview' && wizardOpen && settings.setupWizard !== false;
  const skipSetup = () => pref({ setupWizard: false });
  const finishSetup = () => pref({ setupWizard: false, ...(state.platform === 'win32' ? { trayPinHint: false } : {}) });
  const [status, tone] = quotaStatus(state),
    dark = settings.theme === 'dark',
    mac = state.platform === 'darwin';
  const stale = (kind) =>
    ['stale', 'offline', 'auth-error'].includes(data.status) ||
    data.errors.some((e) => e.endpoint === kind || e.endpoint === 'identity');
  const summaryLabel =
    s?.scope === 'history' ? t('累计汇总') : { today: t('今日'), '7d': t('近 7 天'), billing: t('本账期') }[range];
  const reset = (w) => <Live>{(now) => t(resetDescription(w, now))}</Live>;
  const monthly = monthlyQuota(data),
    monthTone =
      num(c?.monthly) && c.monthly <= 0
        ? 'red'
        : num(monthly.remainingPercent) && monthly.remainingPercent < settings.threshold
          ? 'amber'
          : 'green';
  const windowTone = (w) =>
    w?.exceeded ? 'red' : num(w?.remainingPercent) && w.remainingPercent < settings.threshold ? 'amber' : 'green';
  const quotas = [
    { id: 'five', title: t('5 小时窗口'), en: '5-HOUR WINDOW', value: c?.five },
    { id: 'week', title: t('每周窗口'), en: 'WEEKLY WINDOW', value: c?.week },
  ];
  // T11.1: with two or more accounts the overview lists them all and the widget follows the tightest one.
  const overview = state.overview,
    glance = (overview?.rows?.length || 0) >= 2;
  const changeTheme = () => pref({ theme: dark ? 'light' : 'dark' });
  const refresh = () => action(() => bridge.refresh());
  // Diagnostics export (T3.3): show everything that would be saved, then save exactly that.
  const openDiagnostics = async () => {
    const text = await action(() => bridge.previewDiagnostics());
    if (typeof text === 'string') {
      setDiagnostics(text);
      setDialog('diagnostics');
    }
  };
  const saveDiagnostics = async () => {
    const saved = await action(() => bridge.saveDiagnostics());
    if (saved) {
      setToast({ title: t('诊断信息已保存。') });
      setDialog(null);
    }
  };
  // Re-read the encrypted account list after a failed load (e.g. Keychain access denied); never overwrites it.
  const retryCredentials = async () => {
    const value = await action(() => bridge.retryCredentials());
    if (value)
      setToast(
        value.credentialIssue
          ? { title: t('仍无法读取本机账户列表，已有加密文件未被覆盖。'), error: true }
          : { title: t('已重新读取本机账户列表。') },
      );
  };

  if (widget)
    return (
      <div className={`app native-widget ${dark ? 'dark' : ''}`}>
        <aside className={`floating-widget ${settings.pinned ? 'pinned' : ''}`} aria-label={t('用量悬浮窗')}>
          <div className="widget-header">
            <span>
              <BrandMark size={17} />
              Usage
            </span>
            <div>
              <IconButton
                label={t('刷新悬浮窗数据')}
                disabled={!state.hasCredential || data.fetching}
                onClick={refresh}
              >
                <ArrowsClockwise className={data.fetching ? 'spin' : ''} size={14} />
              </IconButton>
              <IconButton
                label={settings.pinned ? t('取消固定以拖动') : t('固定位置')}
                className={settings.pinned ? 'pin-active' : ''}
                onClick={() => pref({ pinned: !settings.pinned })}
              >
                <PushPin size={14} weight={settings.pinned ? 'fill' : 'regular'} />
              </IconButton>
              <IconButton label={t('关闭悬浮窗')} onClick={() => action(() => bridge.window('hide-widget'))}>
                <X size={15} />
              </IconButton>
            </div>
          </div>
          <div className="widget-body">
            {glance ? (
              <GlanceWidget overview={overview} expanded={!!settings.widgetExpanded} />
            ) : balanceOnly ? (
              <BalanceWidget state={state} />
            ) : generic ? (
              <ProviderWidget state={state} />
            ) : (
              <>
                <div className={`widget-month ${monthTone}-text`}>
                  <div>
                    <span>{t('月度套餐余额')}</span>
                    <small>{monthly.resetAt ? t('账期至 {v0}', { v0: date(monthly.resetAt) }) : t('账期待同步')}</small>
                  </div>
                  <strong className="mono">{currency(c?.monthly)}</strong>
                </div>
                {quotas.map((q, i) => (
                  <React.Fragment key={q.id}>
                    <div className={`widget-row ${i ? 'second' : ''}`}>
                      <span>
                        {i ? t('每周') : t('5 小时')}
                        <span className="micro-label">{t('剩余')}</span>
                      </span>
                      <strong className="mono">
                        {q.value?.unlimited ? t('不限') : pct(q.value?.remainingPercent)}
                        {num(q.value?.remainingPercent) && <small>%</small>}
                      </strong>
                    </div>
                    <Segments
                      value={q.value?.remainingPercent}
                      small
                      label={t('{v0}剩余', { v0: q.title })}
                      tone={windowTone(q.value)}
                    />
                    <div
                      className="widget-reset"
                      title={q.value?.resetAt ? new Date(q.value.resetAt).toLocaleString(locale()) : ''}
                    >
                      <Clock size={12} />
                      {reset(q.value)}
                    </div>
                  </React.Fragment>
                ))}
                {settings.widgetExpanded && (
                  <section className="widget-extra" aria-label={t('悬浮窗展开数据')}>
                    <div className="widget-extra-title">
                      {parts.summary?.scope === 'billing' ? t('本账期') : t('累计')}
                      {t('用量')}
                      <span>{t('账户汇总')}</span>
                    </div>
                    <div className="widget-extra-grid">
                      {[
                        ['Token', compact(parts.summary?.total)],
                        [t('费用'), currency(parts.summary?.cost)],
                        [t('请求数'), compact(parts.summary?.requests)],
                        [t('成功率'), num(parts.summary?.successRate) ? pct(parts.summary.successRate) + '%' : '—'],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong className="mono">{value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="widget-other-balance">
                      <span>
                        {t('购买')} {currency(c?.purchased)}
                      </span>
                      <span>
                        {t('免费')} {currency(c?.free)}
                      </span>
                    </div>
                    <small className="widget-synced">
                      {data.fetching ? t('正在同步…') : t('额度更新 {v0}', { v0: time(updatedAt.credits) })}
                    </small>
                  </section>
                )}
              </>
            )}
          </div>
          {glance ? (
            <GlanceStatus overview={overview} expanded={!!settings.widgetExpanded} />
          ) : (
            <div className="widget-status" title={t(status)}>
              <span className={`status-dot ${tone}`} />
              {stale('credits') && c ? t('上次数据 · ') : ''}
              {t(status)}
            </div>
          )}
          <div className="widget-footer">
            <button
              aria-expanded={!!settings.widgetExpanded}
              onClick={() => pref({ widgetExpanded: !settings.widgetExpanded })}
            >
              {glance
                ? settings.widgetExpanded
                  ? t('收起')
                  : t('展开全部账户')
                : settings.widgetExpanded
                  ? t('收起数据')
                  : t('展开数据')}
              <CaretDown size={13} style={{ transform: settings.widgetExpanded ? 'rotate(180deg)' : undefined }} />
            </button>
            <button onClick={() => action(() => bridge.window('show-main'))}>
              {t('详细面板')}
              <ArrowUpRight size={13} />
            </button>
          </div>
        </aside>
      </div>
    );

  return (
    <div className={`app native-app ${mac ? 'mac' : ''} ${dark ? 'dark' : ''}`}>
      {browserPreview && (
        <div className="preview-bar">
          <span>{t('桌面版界面预览 · 示例数据')}</span>
          <span>{t('原生功能请在 Windows 应用中使用')}</span>
        </div>
      )}
      <div className="app-shell">
        <aside className="rail" aria-label={t('主导航')}>
          <button className="app-mark" aria-label={t('返回用量总览')} onClick={() => setView('overview')}>
            <BrandMark size={27} />
          </button>
          <div className="rail-nav">
            <IconButton
              label={t('用量总览')}
              className={view === 'overview' ? 'active' : ''}
              onClick={() => setView('overview')}
            >
              <ChartBar size={21} />
            </IconButton>
            <IconButton label={t('用量分析')} className={view === 'analytics' ? 'active' : ''} onClick={openAnalytics}>
              <SquaresFour size={21} />
            </IconButton>
            <IconButton
              label={t('覆盖范围报告')}
              className={view === 'reconciliation' ? 'active' : ''}
              onClick={() => setView('reconciliation')}
            >
              <ArrowsLeftRight size={21} />
            </IconButton>
            <IconButton
              label={t('账户与设置')}
              className={view === 'settings' ? 'active' : ''}
              onClick={() => setView('settings')}
            >
              <GearSix size={21} />
            </IconButton>
          </div>
          <div className="rail-bottom">
            <IconButton label={dark ? t('切换浅色模式') : t('切换深色模式')} onClick={changeTheme}>
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </IconButton>
            <IconButton label={t('统计口径说明')} onClick={() => setDialog('about')}>
              <Info size={20} />
            </IconButton>
          </div>
        </aside>
        <div className="app-body">
          <header className="titlebar">
            <div className="breadcrumb">
              <span className="brand">{t('Token 用量助手')}</span>
              <span className="slash">/</span>
              <span>
                {view === 'overview'
                  ? 'Usage'
                  : view === 'analytics'
                    ? 'Analytics'
                    : view === 'reconciliation'
                      ? 'Coverage'
                      : 'Settings'}
              </span>
              <span className="desktop-badge">DESKTOP</span>
            </div>
            <div className="window-actions">
              <span className="version-tag">v{state.version}</span>
              {!mac && (
                <>
                  <IconButton label={t('收起到系统托盘')} onClick={() => action(() => bridge.window('hide-main'))}>
                    <Minus size={17} />
                  </IconButton>
                  <IconButton label={t('最大化或还原')} onClick={() => action(() => bridge.window('maximize'))}>
                    <Square size={14} />
                  </IconButton>
                  <IconButton label={t('关闭面板并留在托盘')} onClick={() => action(() => bridge.window('hide-main'))}>
                    <X size={17} />
                  </IconButton>
                </>
              )}
            </div>
          </header>
          <main className="main-content" aria-label={t('详细面板内容')}>
            {setup ? (
              <SetupHeading mac={mac} onSkip={skipSetup} />
            ) : (
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR USAGE, AT A GLANCE</div>
                  <h1>
                    <span>//</span>{' '}
                    {view === 'overview'
                      ? t('用量总览')
                      : view === 'analytics'
                        ? t('用量分析')
                        : view === 'reconciliation'
                          ? t('覆盖范围报告')
                          : t('账户与设置')}
                  </h1>
                  <p>
                    {view === 'overview'
                      ? t('掌握使用节奏，安心专注下一次创作。')
                      : view === 'analytics'
                        ? t('看清消耗的变化，也看清每一份用量的去向。')
                        : view === 'reconciliation'
                          ? t('看清本机记录覆盖了哪些时段、缺了什么，以及哪些记录已归入账户。')
                          : t('本机连接账户，让助手按你的节奏工作。')}
                  </p>
                </div>
                <div className="heading-actions">
                  {view === 'overview' ? (
                    <>
                      <button className="button" disabled={!state.hasCredential || data.fetching} onClick={refresh}>
                        <ArrowsClockwise size={16} className={data.fetching ? 'spin' : ''} />
                        {data.fetching ? t('正在刷新') : t('刷新')}
                      </button>
                      <button
                        className={`button primary ${settings.floating ? 'selected' : ''}`}
                        onClick={() => pref({ floating: !settings.floating })}
                      >
                        <PushPin size={16} />
                        {settings.floating ? t('收起悬浮窗') : t('显示悬浮窗')}
                      </button>
                    </>
                  ) : (
                    <button className="button" onClick={() => setView('overview')}>
                      {t('返回总览')}
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {view === 'overview' && !setup && state.platform === 'win32' && settings.trayPinHint !== false && (
              <div className="inline-note" role="status">
                <PushPin size={16} />
                <span>
                  {t(
                    '托盘图标可能收在任务栏的「^」里。想一直显示：任务栏设置 → 其他系统托盘图标，打开「Token 用量助手」。左键点它打开用量面板。',
                  )}
                </span>
                <button onClick={() => pref({ trayPinHint: false })}>
                  {t('知道了')}
                  <X size={13} />
                </button>
              </div>
            )}
            {setup && (
              <SetupWizard
                state={state}
                preview={browserPreview}
                connect={(value) => action(() => bridge.connect(value), t('本机连接已保存。'))}
                addSource={(kind, label) => action(() => bridge.addToolSource({ kind, label }))}
                discover={discoverTools}
                finish={finishSetup}
              />
            )}
            {view === 'overview' && !setup && glance && (
              <AllAccountsGrid
                overview={overview}
                disabled={state.connecting}
                onSelect={(id) => action(() => bridge.selectAccount(id))}
              />
            )}
            {view !== 'reconciliation' && !setup && (
              <AccountSwitcher
                state={state}
                onSelect={(id) => action(() => bridge.selectAccount(id))}
                onManage={() => setView('settings')}
              />
            )}
            {setup ? null : view === 'overview' ? (
              balanceOnly ? (
                <BalanceDashboard
                  state={state}
                  onSettings={() => setView('settings')}
                  onTools={() => {
                    setAnalysisSource('tools');
                    openAnalytics();
                  }}
                />
              ) : generic ? (
                <ProviderDashboard
                  state={state}
                  onSettings={() => setView('settings')}
                  pace={state.pace && <PaceLine pace={state.pace} className="overview-pace" />}
                />
              ) : (
                <>
                  {!state.hasCredential && (
                    <div className="connection-banner">
                      <Key size={20} />
                      <div>
                        <strong>{t('连接账户，开始监测')}</strong>
                        <p>
                          {t(
                            '支持 DeepSeek 官方按量，以及 ChatGPT / Codex、Claude、GLM、MiniMax、火山与 Command Code 套餐。',
                          )}
                        </p>
                      </div>
                      <button className="button primary" onClick={() => setView('settings')}>
                        {t('连接账户')}
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  )}
                  <div className="overview-range-line">
                    <RangeControl value={range} onChange={setRange} billingAvailable={!!sub?.start} />
                    <span>
                      {analysis.loading
                        ? t('正在同步所选时段…')
                        : t('Token 与费用按所选时段统计，额度窗口显示当前状态')}
                    </span>
                  </div>
                  {state.hasCredential && (analysis.error || analysis.report?.message) && (
                    <div className="inline-warning" role="status">
                      <WarningCircle size={16} />
                      <span>
                        {analysis.error || (
                          <Disclosure summary={analysis.report.message} detail={analysis.report.messageDetail} />
                        )}
                      </span>
                    </div>
                  )}
                  <div className="account-line">
                    <span>
                      <span className={`status-dot ${tone}`} />
                      {identity
                        ? `${identity.label} · ${identity.scope === 'organization' ? t('组织汇总') : t('账户汇总')}`
                        : t('尚未连接账户')}
                    </span>
                    <span>
                      <Live>
                        {(now) =>
                          new Date(now).toLocaleDateString(locale(), { month: 'long', day: 'numeric', weekday: 'long' })
                        }
                      </Live>
                    </span>
                  </div>
                  {/* T11.3: the forecast below in one line, for the current Command Code account. */}
                  {state.hasCredential && analysis.report?.prediction && (
                    <PaceLine pace={paceLine(analysis.report.prediction)} className="overview-pace" />
                  )}
                  {mac && state.menubar?.hidden === true && settings.menubarUsage !== false && (
                    <div className="inline-warning" role="status">
                      <WarningCircle size={17} />
                      <span>
                        {t('菜单栏空间不足，用量图标已被系统隐藏。可改用「① 只有刻度环」，或减少其他菜单栏图标。')}
                      </span>
                      <button onClick={() => openSettingsAt('menubar-settings')}>
                        {t('菜单栏设置')}
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                  )}
                  {(data.errors.length > 0 || state.credentialIssue) && (
                    <div className="inline-warning" role="status">
                      <WarningCircle size={17} />
                      <span>
                        {state.credentialIssue || data.errors[0].message}
                        {c ? t(' 已保留上次成功数据。') : ''}
                      </span>
                      {state.credentialIssue ? (
                        <button onClick={retryCredentials}>
                          {t('重新读取')}
                          <ArrowsClockwise size={14} />
                        </button>
                      ) : (
                        <button onClick={() => (data.status === 'auth-error' ? setView('settings') : refresh())}>
                          {data.status === 'auth-error' ? t('重新连接') : t('重试')}
                          <ArrowUpRight size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className="overview-grid">
                    <section className="panel monthly-panel">
                      <div className="panel-heading">
                        <Section icon={Coins} tone="green-text">
                          MONTHLY CREDITS <span className="label-cn">{t('/ 月度套餐额度')}</span>
                        </Section>
                        <span className="subtle-label">
                          {stale('credits') && c ? t('上次数据 · ') : ''}
                          {t('当前账期')}
                        </span>
                      </div>
                      <div className="month-content">
                        <div className="month-number">
                          <span>{t('月度剩余额度')}</span>
                          <strong className={`mono ${monthTone === 'green' ? '' : monthTone + '-text'}`}>
                            {currency(c?.monthly)}
                          </strong>
                          <small>
                            {monthly.pool !== null
                              ? t('账期额度 {v0} · 已用 {v1}', {
                                  v0: currency(monthly.pool),
                                  v1: currency(monthly.spent),
                                })
                              : t('账期总额度暂缺，先显示账户余额')}
                          </small>
                        </div>
                        <div className="month-track">
                          <div>
                            <span>
                              {monthly.remainingPercent !== null
                                ? t('剩余 {v0}%', { v0: pct(monthly.remainingPercent) })
                                : t('余额独立于 5 小时 / 每周窗口')}
                            </span>
                            <span>
                              {monthly.resetAt
                                ? t('账期结束 {v0}', { v0: date(monthly.resetAt) })
                                : t('账期结束时间待同步')}
                            </span>
                          </div>
                          <Segments
                            value={monthly.remainingPercent}
                            small
                            label={t('月度套餐额度剩余')}
                            tone={monthTone}
                          />
                          <small>
                            {monthly.pool !== null
                              ? t('账期额度按同次同步的余额＋已用计算')
                              : t('缺少有效账期或月度消耗时不推算百分比')}
                          </small>
                        </div>
                      </div>
                      <div className="month-bottom">
                        <span>
                          {num(c?.monthly) && c.monthly <= 0
                            ? c.purchased > 0
                              ? t('月额度已耗尽，仍有购买余额')
                              : c.free > 0
                                ? t('月额度已耗尽，另有免费余额')
                                : t('月额度已耗尽，请查看其他余额或等待新账期')
                            : t('短周期窗口有剩余，也需要月余额支持套餐使用')}
                        </span>
                        <span>
                          {t('购买')} <b className="mono">{currency(c?.purchased)}</b> {t('· 免费')}{' '}
                          <b className="mono">{currency(c?.free)}</b>
                        </span>
                        <button className="text-button" onClick={() => setDialog('billing')}>
                          {t('额度说明')}
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                    </section>
                    <section className="panel quota-panel">
                      <div className="panel-heading">
                        <Section icon={ShieldCheck} tone="green-text">
                          USAGE LIMITS <span className="label-cn">{t('/ 额度窗口')}</span>
                        </Section>
                        <span className={`status-tag ${tone}`}>{t(status)}</span>
                      </div>
                      <div className="quota-subhead">
                        <span>
                          {stale('credits') && c
                            ? t('上次数据 · {v0}', { v0: time(updatedAt.credits) })
                            : t('每个窗口独立计算')}
                        </span>
                        <div className="segmented-control" aria-label={t('额度显示方式')}>
                          <button
                            className={!used ? 'selected' : ''}
                            aria-pressed={!used}
                            onClick={() => setUsed(false)}
                          >
                            {t('剩余')}
                          </button>
                          <button className={used ? 'selected' : ''} aria-pressed={used} onClick={() => setUsed(true)}>
                            {t('已用')}
                          </button>
                        </div>
                      </div>
                      {quotas.map((q) => (
                        <div className="quota-row" key={q.id}>
                          <div className="quota-top">
                            <div>
                              <h2>{q.title}</h2>
                              <div className="micro-label">{q.en}</div>
                            </div>
                            <div className={`quota-number ${windowTone(q.value)}-text`}>
                              <strong>
                                {q.value?.unlimited
                                  ? t('不限')
                                  : pct(used ? q.value?.usedPercent : q.value?.remainingPercent)}
                                {num(q.value?.remainingPercent) && <span>%</span>}
                              </strong>
                              <span className="remaining-label">
                                {q.value?.unlimited ? t('额度') : used ? t('已用') : t('剩余')}
                              </span>
                            </div>
                          </div>
                          <Segments
                            value={used ? q.value?.usedPercent : q.value?.remainingPercent}
                            label={`${q.title}${used ? t('已用') : t('剩余')}`}
                            tone={windowTone(q.value)}
                          />
                          <div className="quota-meta">
                            <span>
                              {q.value?.unlimited
                                ? t('当前未设窗口限制')
                                : num(q.value?.used)
                                  ? t('已用 {v0} / {v1}', { v0: currency(q.value.used), v1: currency(q.value.cap) })
                                  : t('等待额度数据')}
                            </span>
                            <span title={q.value?.resetAt ? new Date(q.value.resetAt).toLocaleString(locale()) : ''}>
                              <Clock size={13} />
                              <b className="mono">{reset(q.value)}</b>
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="quota-footer">
                        <Info size={14} />
                        <span>{t('额度按费用计算，不能直接换算为剩余 Token。')}</span>
                      </div>
                    </section>
                    <div className="summary-stack">
                      <section className="panel token-panel">
                        <div className="panel-heading">
                          <Section icon={Lightning} tone="purple-text">
                            TOTAL TOKENS
                          </Section>
                          <span className="subtle-label">
                            {stale('summary') && s ? t('上次数据 · ') : ''}
                            {summaryLabel}
                          </span>
                        </div>
                        <div className="token-total mono">
                          {compact(s?.total)}
                          <small>tokens</small>
                        </div>
                        <div
                          className={`token-distribution ${s?.input + s?.output > 0 ? '' : 'unknown'}`}
                          aria-label={t('输入与输出 Token 构成')}
                        >
                          <span style={{ flex: num(s?.input) ? s.input : 1 }} />
                          <span style={{ flex: num(s?.output) ? s.output : 1 }} />
                        </div>
                        <div className="token-legend">
                          <div>
                            <span className="legend-mark input" />
                            {t('输入 Token')}
                            <strong className="mono">{compact(s?.input)}</strong>
                          </div>
                          <div>
                            <span className="legend-mark output" />
                            {t('输出 Token')}
                            <strong className="mono">{compact(s?.output)}</strong>
                          </div>
                        </div>
                        <div className="token-note">
                          {s?.scope === 'history'
                            ? t('全历史累计 · 账期范围未确认')
                            : s
                              ? t('输入与输出合计 · {v0}累计', { v0: summaryLabel })
                              : t('连接后显示账户汇总')}
                        </div>
                      </section>
                      <section className="panel activity-panel">
                        <div className="panel-heading">
                          <Section icon={Coins} tone="amber-text">
                            BILLING SUMMARY
                          </Section>
                          <span className="subtle-label">USD</span>
                        </div>
                        <div className="billing-summary">
                          <div>
                            <span>
                              {summaryLabel}
                              {t('费用')}
                            </span>
                            <strong className="mono">{currency(s?.cost)}</strong>
                          </div>
                          <div>
                            <span>{t('总请求数')}</span>
                            <strong className="mono">
                              {compact(s?.requests)}
                              <small>{t('次')}</small>
                            </strong>
                          </div>
                        </div>
                        <div className="billing-footer">
                          <span className={`status-dot ${sub?.active ? 'green' : 'neutral'}`} />
                          <span title={sub?.planId || ''}>{sub?.planId || t('套餐待同步')}</span>
                          <span>{sub?.start ? `${date(sub.start)} — ${date(sub?.end)}` : t('账期未确认')}</span>
                        </div>
                      </section>
                    </div>
                  </div>

                  <HealthStrip summary={s} onOpen={openAnalytics} />
                  <section className="details-section">
                    <button className="details-heading" aria-expanded={details} onClick={() => setDetails(!details)}>
                      <span>
                        <span className="slash">//</span>
                        {t('汇总明细')}
                        <span className="caption">ACCOUNT SUMMARY</span>
                      </span>
                      {details ? <CaretDown size={17} /> : <CaretRight size={17} />}
                    </button>
                    {details && (
                      <div className="details-table-wrap">
                        <table className="details-table">
                          <thead>
                            <tr>
                              <th>{t('统计项')}</th>
                              <th>{t('汇总值')}</th>
                              <th>{t('范围')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              [t('输入 Token'), fullNumber(s?.input), summaryLabel],
                              [t('输出 Token'), fullNumber(s?.output), summaryLabel],
                              [t('全部 Token'), fullNumber(s?.total), summaryLabel],
                              [t('请求数'), fullNumber(s?.requests), summaryLabel],
                              [t('累计费用'), currency(s?.cost), summaryLabel],
                              [t('购买额度余额'), currency(c?.purchased), t('当前余额')],
                              [t('免费额度余额'), currency(c?.free), t('当前余额')],
                            ].map((row) => (
                              <tr key={row[0]}>
                                <td>{row[0]}</td>
                                <td className="mono">{row[1]}</td>
                                <td>{row[2]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="table-note">
                          {t('Token 数据更新于')} {time(analysis.report?.updatedAt || updatedAt.summary)}{' '}
                          {t('· 额度更新于')} {time(updatedAt.credits)}
                        </p>
                      </div>
                    )}
                  </section>
                  <div className="quiet-note">
                    <Bell size={15} />
                    <span>
                      {settings.notifications
                        ? t('低于 {v0}% 时提醒你，其余时间保持安静。', { v0: settings.threshold })
                        : t('额度提醒已关闭。')}
                    </span>
                    <button onClick={() => setView('settings')}>
                      {t('调整提醒')}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                </>
              )
            ) : view === 'analytics' ? (
              <AnalyticsPage
                billingGroups={billingGroups}
                billingGroupId={billingGroupId}
                onBillingGroupId={(id) => {
                  setBillingGroupId(id);
                  setRange('today');
                  setFilters({ model: '', project: '', session: '' });
                }}
                toolSources={state.toolSources || []}
                sourceIds={sourceIds}
                onSourceIds={(ids) => {
                  setSourceIds(ids);
                  setFilters({ model: '', project: '', session: '' });
                }}
                onManageSources={() => setView('settings')}
                quotaOnly={generic}
                balanceOnly={balanceOnly}
                report={analysis.report}
                loading={analysis.loading}
                error={analysis.error}
                source={analysisSource}
                onSource={(value) => {
                  setAnalysisSource(value);
                  if (value !== 'account' && range === 'billing' && !toolBillingAvailable) setRange('today');
                  setFilters({ model: '', project: '', session: '' });
                }}
                range={range}
                onRange={setRange}
                filters={filters}
                onFilters={setFilters}
                refresh={analysis.refresh}
                cancel={analysis.cancel}
                dark={dark}
                billingAvailable={analysisSource === 'account' ? !!sub?.start : toolBillingAvailable}
                chooseDatabase={async () => {
                  await action(() => bridge.chooseLocalDatabase());
                  analysis.refresh();
                }}
                savePrice={(value) => action(() => bridge.saveModelPrice(value), t('估算单价已保存。'))}
                onExport={async () => {
                  const done = await action(() =>
                    bridge.exportCsv({ source: 'tools', range, ...filters, sourceIds, billingGroupId }),
                  );
                  if (done && !done.cancelled)
                    setToast({
                      title:
                        t('已导出 {v0} 条用量明细', { v0: done.count.toLocaleString('en-US') }) +
                        (done.truncated ? t('（只含最近 100,000 条）') : '') +
                        (done.partial ? t('；部分来源未同步，只含可读取的记录') : ''),
                    });
                }}
              />
            ) : view === 'reconciliation' ? (
              <ReconciliationPage state={state} bridge={bridge} onSettings={() => setView('settings')} />
            ) : (
              <div className="native-settings">
                <ConnectionForm
                  state={state}
                  preview={browserPreview}
                  action={(value) => action(() => bridge.connect(value), t('本机连接已保存，可在总览查看账户数据。'))}
                  onConnected={() => setView('overview')}
                  onRemove={() => setDialog('disconnect')}
                  onClaudeConfig={(change) => action(() => bridge.claudeConfig(change), t('已更新'))}
                />
                {state.toolSourceIssue && (
                  <div className="inline-warning" role="status">
                    {state.toolSourceIssue}
                  </div>
                )}
                <ToolSources
                  sources={state.toolSources || []}
                  onAdd={(kind, label) => action(() => bridge.addToolSource({ kind, label }))}
                  onUpdate={(id, patch) => action(() => bridge.updateToolSource(id, patch))}
                  onChoose={(id) => action(() => bridge.chooseToolSource(id))}
                  onRemove={(id) => action(() => bridge.removeToolSource(id))}
                  onSync={(id) => action(() => bridge.syncToolSource(id))}
                  onDiscover={discoverTools}
                />
                <AdvancedSettings associations={state.associations}>
                  <AccountLinks
                    state={state}
                    run={(kind, value) => action(() => bridge[kind](value), t('账户关联已更新。'))}
                  />
                </AdvancedSettings>
                <section className="settings-panel panel">
                  <Section icon={GearSix}>PREFERENCES</Section>
                  {[
                    {
                      title: t('额度提醒'),
                      note: t('套餐账户独立监测，窗口低于阈值时提醒；按量余额不使用百分比阈值。'),
                      key: 'notifications',
                      label: t('开启额度提醒'),
                    },
                    {
                      title: t('悬浮窗'),
                      note: t('独立桌面窗口，关闭主面板后仍可查看额度。'),
                      key: 'floating',
                      label: t('开启悬浮窗'),
                    },
                    {
                      title: t('开机启动'),
                      note: state.packaged
                        ? mac
                          ? state.loginItem?.status === 'requires-approval'
                            ? t('需要在系统设置的登录项中允许启动。')
                            : state.loginItem?.status === 'enabled'
                              ? t('系统已登记登录启动，登录后在菜单栏运行。')
                              : t('在系统登录时启动；测试版需在 Mac 上验证登记结果。')
                          : t('登录 Windows 后在托盘中运行。')
                        : t('打包后的桌面版可启用此项。'),
                      key: 'launchAtLogin',
                      label: t('开启开机启动'),
                    },
                    {
                      // T5.2: the check only tells the user. T12.8: the installed Windows build can also download
                      // and install the update, each step only after a click.
                      title: t('检查更新'),
                      note:
                        settings.updateCheck && state.update?.status === 'available' ? (
                          <UpdateNote update={state.update} current={state.version} action={action} />
                        ) : state.update?.install ? (
                          <Disclosure
                            summary={t('每 24 小时检查一次；有新版本时点一下即可下载安装')}
                            detail={t(
                              '启动时和每 24 小时向 GitHub 请求公开版本列表，不发送账户或设备信息。发现新版本后，点「下载并安装」才从安装包仓库下载安装包并核对校验值，下载完再点「重启并安装」；不会自动下载，也不会在退出时自动安装。',
                            )}
                          />
                        ) : (
                          <Disclosure
                            summary={t('每 24 小时检查一次，只提示不下载')}
                            detail={t('启动时和每 24 小时向 GitHub 请求公开版本列表，不发送账户或设备信息。')}
                          />
                        ),
                      key: 'updateCheck',
                      label: t('开启检查更新'),
                    },
                    {
                      // T12.7 (D19 ④): format C, e.g. "Claude 5h 60% · 最紧 OpenRouter 35%".
                      title: t('Claude Code 状态栏'),
                      note: (
                        <Disclosure
                          summary={t('在 Claude Code 底部显示本会话额度和最紧的其他账户')}
                          detail={t(
                            '对用助手生成的启动脚本打开的会话，以及「接入所有会话」后的所有 Claude Code 会话生效，例如「Claude 5h 60% · 最紧 OpenRouter 35%」。文字由本机助手算好后交给状态栏，不联网；关闭时状态栏照旧只显示采集状态。',
                          )}
                        />
                      ),
                      key: 'claudeStatusQuota',
                      label: t('在 Claude Code 状态栏显示额度'),
                    },
                    {
                      // T13.5 (D20 ③): a snapshot file and a command that prints it; no network service.
                      title: t('命令行读取额度'),
                      note: state.statusCommand ? (
                        <>
                          {t('运行')}{' '}
                          <code>
                            {/\s/.test(state.statusCommand) ? `"${state.statusCommand}"` : state.statusCommand}
                          </code>
                          {t('（加 --text 输出文字）')}{' '}
                          <button className="text-button" onClick={() => action(() => bridge.showStatusCommand())}>
                            {t('在文件夹中显示')}
                            <Folder size={13} />
                          </button>
                        </>
                      ) : (
                        <Disclosure
                          summary={t('生成一个命令，打印全部账户的额度（JSON 或文字）')}
                          detail={t(
                            '开启后，助手在自己的数据目录里保存一份额度快照，并放一个命令（Mac 为 tua-status，Windows 为 tua-status.cmd）打印它，方便脚本和其他工具读取。只含额度百分比、重置时间和余额，不含密钥；不开放网络端口。助手关闭时命令显示最后一次的值和时间；关闭此项会删除这些文件。',
                          )}
                        />
                      ),
                      key: 'statusExport',
                      label: t('开启命令行读取额度'),
                    },
                    {
                      // T14.3 (D21 ③): official status pages, off by default (it adds network requests).
                      title: t('服务商状态'),
                      note: (
                        <Disclosure
                          summary={t('在账户详情显示平台官方状态页的当前状态')}
                          detail={t(
                            '开启后每 5 分钟访问一次已连接平台的公开状态页（不带任何凭据），目前支持 Anthropic（Claude）、OpenAI（Codex）、Moonshot（Kimi 开放平台）、MiniMax；其他平台没有可读取的状态接口，不显示。只作提示，不影响额度、余额和菜单栏颜色。',
                          )}
                        />
                      ),
                      key: 'providerStatus',
                      label: t('显示服务商状态'),
                    },
                  ].map((item) => (
                    <div className="setting-row" key={item.key}>
                      <div>
                        <h2>{item.title}</h2>
                        <p>{item.note}</p>
                      </div>
                      <Toggle
                        label={item.label}
                        checked={settings[item.key]}
                        disabled={item.key === 'launchAtLogin' && !state.packaged}
                        onChange={(v) => pref({ [item.key]: v })}
                      />
                    </div>
                  ))}
                  <div className="setting-row">
                    <div>
                      <h2>{t('提醒阈值')}</h2>
                      <p>{t('任一窗口低于阈值时通知。')}</p>
                    </div>
                    <Select
                      label={t('提醒阈值')}
                      value={settings.threshold}
                      disabled={!settings.notifications}
                      onChange={(value) => pref({ threshold: Number(value) })}
                      menuWidth={160}
                      options={[10, 20, 30].map((v) => ({ value: v, label: t('低于 {v0}%', { v0: v }) }))}
                    />
                  </div>
                  <BalanceThresholds
                    // A saved change (here or elsewhere) starts the fields over from the settings.
                    key={settings.balanceThresholdCNY + '|' + settings.balanceThresholdUSD}
                    settings={settings}
                    pref={pref}
                  />
                  <div className="setting-row">
                    <div>
                      <h2>{t('自动刷新')}</h2>
                      <p>{t('查询失败时自动降低频率，联网后恢复。')}</p>
                    </div>
                    <Select
                      label={t('自动刷新间隔')}
                      value={settings.refreshSeconds}
                      onChange={(value) => pref({ refreshSeconds: Number(value) })}
                      menuWidth={160}
                      options={[30, 60, 120, 300].map((v) => ({
                        value: v,
                        label: t('每 {v0}', { v0: v >= 60 ? t('{v0} 分钟', { v0: v / 60 }) : t('{v0} 秒', { v0: v }) }),
                      }))}
                    />
                  </div>
                  <div className="setting-row">
                    <div>
                      <h2>{t('深色外观')}</h2>
                      <p>{t('同时应用到主面板和悬浮窗。')}</p>
                    </div>
                    <Toggle
                      label={t('开启深色外观')}
                      checked={dark}
                      onChange={(v) => pref({ theme: v ? 'dark' : 'light' })}
                    />
                  </div>
                  <div className="setting-row">
                    <div>
                      <h2>{t('语言')} · Language</h2>
                      <p>{t('界面语言；跟随系统时，中文系统显示中文，其他显示英文。')}</p>
                    </div>
                    <Select
                      label={t('语言')}
                      value={settings.language || 'system'}
                      onChange={(value) => pref({ language: value })}
                      menuWidth={160}
                      options={[
                        { value: 'system', label: t('跟随系统') },
                        { value: 'zh', label: '中文' },
                        { value: 'en', label: 'English' },
                      ]}
                    />
                  </div>
                  {(mac || state.platform === 'win32') && (
                    <MenubarSettings state={state} settings={settings} pref={pref} mac={mac} />
                  )}
                  <div className="settings-bottom">
                    <span>
                      <Check size={14} />
                      {t('设置自动保存在本机')}
                    </span>
                    <div className="settings-actions">
                      <button className="button" onClick={openDiagnostics}>
                        <FileArrowDown size={15} />
                        {t('导出诊断信息')}
                      </button>
                      <button
                        className="button"
                        disabled={!settings.notifications}
                        onClick={() => action(() => bridge.testNotification(), t('已请求系统显示测试通知。'))}
                      >
                        <Bell size={15} />
                        {t('测试通知')}
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}
            <footer className="main-footer">
              <div>
                <span className={`status-dot ${tone}`} />
                <span>
                  {data.fetching
                    ? t('正在同步')
                    : state.connectionStatus && !updatedAt.credits
                      ? state.connectionStatus.quota.label
                      : c || s || parts.balance
                        ? t('上次成功 {v0}', {
                            v0: time(Math.max(updatedAt.credits || 0, updatedAt.summary || 0, updatedAt.balance || 0)),
                          })
                        : t('等待连接')}
                </span>
                <span className="footer-separator">·</span>
                <span>
                  {data.nextRefreshAt ? (
                    <Live>
                      {(now) => t('{v0} 秒后刷新', { v0: Math.max(0, Math.ceil((data.nextRefreshAt - now) / 1000)) })}
                    </Live>
                  ) : (
                    t('每 {v0} 秒刷新', { v0: state.refreshInterval || settings.refreshSeconds })
                  )}
                </span>
              </div>
              <button onClick={() => action(() => bridge.openOfficial('usage'))}>
                {t('打开官方平台')}
                <ArrowSquareOut size={14} />
              </button>
            </footer>
          </main>
        </div>
      </div>
      {toast && (
        <div className={`toast ${toast.error ? 'warning' : ''}`} role="status">
          <div className="toast-icon">{toast.error ? <WarningCircle size={19} /> : <Check size={19} />}</div>
          <div>
            <strong>{toast.title}</strong>
          </div>
          <IconButton label={t('关闭提示')} onClick={() => setToast(null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      <dialog className="info-dialog" ref={dialogRef} onClose={() => setDialog(null)} aria-labelledby="dialog-title">
        <div className="dialog-title">
          <h2 id="dialog-title">
            {dialog === 'disconnect'
              ? t('移除本机连接')
              : dialog === 'billing'
                ? t('额度与账期口径')
                : dialog === 'diagnostics'
                  ? t('导出诊断信息')
                  : t('关于用量助手')}
          </h2>
          <IconButton label={t('关闭说明')} onClick={() => setDialog(null)}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="dialog-content">
          {dialog === 'disconnect' ? (
            <>
              <p>
                {t(
                  '这会删除本机保存的密钥、用量快照和账户采样历史，并停止自动查询。其他本机连接不受影响，不会注销平台账户。',
                )}
              </p>
              <button
                className="button primary"
                onClick={async () => {
                  const r = await action(() => bridge.disconnect(), t('本机连接已移除。'));
                  if (r) setDialog(null);
                }}
              >
                {t('移除连接')}
              </button>
            </>
          ) : dialog === 'diagnostics' ? (
            <>
              <p>
                {t(
                  '下面是将要保存的全部内容：版本、系统、设置、各账户与工具来源的状态，以及最近 500 行本机日志。不含密钥、账户名称、文件路径或对话内容。',
                )}
              </p>
              <pre className="diagnostics-preview" tabIndex={0} aria-label={t('诊断信息预览')}>
                {diagnostics}
              </pre>
              <button className="button primary" onClick={saveDiagnostics}>
                <FileArrowDown size={15} />
                {t('保存为文件…')}
              </button>
            </>
          ) : dialog === 'billing' ? (
            <>
              <p>
                {t(
                  '套餐月额度、5 小时与每周窗口需要共同满足。即使短周期窗口有余量，月额度用尽也无法继续使用套餐额度；购买余额可按账户规则继续使用。',
                )}
              </p>
              <p>
                {t(
                  '月余额直接来自账户接口。账期额度与剩余百分比仅在同次同步的账期和月度消耗均有效时，按“余额＋已用”计算；不根据套餐名称猜测总额。',
                )}
              </p>
              <p>
                {t(
                  '5 小时和每周窗口从首次使用开始计时。接口明确返回尚未开始的窗口时，显示“未启用”；字段缺失时显示“重置时间暂未返回”。剩余不足 0.5% 但未用尽时显示“',
                )}
                {'<1%'}
                {t('”，不写成 0%。')}
              </p>
              <p>
                {t('汇总接口若未能确认账期范围，会标为“累计汇总”，不会当作本账期用量。Token 数和费用余额分别统计。')}
              </p>
              <p>
                {t('购买额度：')}
                {currency(c?.purchased)} {t('· 免费额度：')}
                {currency(c?.free)}
              </p>
            </>
          ) : (
            <>
              <p>
                {t('Token 用量助手 v')}
                {state.version} {t('· 独立桌面工具，非任何平台官方客户端。')}
              </p>
              <p>
                {t(
                  '查询已连接平台的账户额度或余额，并读取 Zcode、Codex 用量元数据及 Harness、Claude Code 本地组件的专用用量记录。不发起模型请求，不读取提示词或补全内容。',
                )}
              </p>
              <p>
                {t('密钥使用')}
                {mac ? t(' macOS 钥匙串') : t(' Windows 系统加密')}
                {t(
                  '保存在本机。账户数据为账户或组织汇总。工具分析独立统计模型、项目、会话与已报告用量（包括失败或取消时明确返回的用量），不能与账户总量相加。',
                )}
              </p>
              <p>{t('上游账户接口可能变化，缺失字段会显示“—”，网络错误保留上次数据。')}</p>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
