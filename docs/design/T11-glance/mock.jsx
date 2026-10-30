// T11.1–T11.3 D10 mock (not shipped). Built from the app's own styles, Bar, Panel and the preview's panel view model
// (desktop/menubar-panel.cjs fed with the preview snapshots), so the screenshots match the real UI. Sample data only.
// ?view=a | b | widget | panel | win  &theme=dark
import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpRight,
  ArrowsClockwise,
  ArrowsLeftRight,
  CaretDown,
  CaretUp,
  ChartBar,
  Clock,
  GearSix,
  Info,
  Moon,
  PushPin,
  Rows,
  SquaresFour,
  Timer,
  X,
} from '@phosphor-icons/react';
import { Bar } from '../../../src/ProviderViews.jsx';
import { BrandMark } from '../../../src/BrandMark.jsx';
import { previewSummaries } from '../../../src/desktop-preview.js';
import { slotsOf, focusOf as focusSlot } from '../../../src/generated/menubar-status.js';
import { panelState } from '../../../src/generated/menubar-panel.js';
import { resetDescription } from '../../../src/generated/domain.js';
import { providerInfo } from '../../../src/generated/provider-catalog.js';
import markSvg from '../../../desktop/assets/brand-mark.svg?raw';
import '../../../src/styles.css';
import '../../../src/desktop.css';
import '../../../src/providers.css';
import '../../../src/panel.css';
import './mock.css';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'a';
const dark = q.get('theme') === 'dark';
const NOW = Date.now();
const LEVEL = { normal: 0, amber: 1, red: 2 };
const barTone = { normal: 'green', amber: 'amber', red: 'red' };
const cmp = (x, y) => (x === y ? 0 : x - y);
const name = (a) => a.label.replace(/ · 示例$/, '');
const platform = (a) => providerInfo(a.provider)?.name || a.provider;

// D17 ④: compact places show two decimals; a non-zero amount below 0.01 reads "<0.01", never 0.00.
function compactMoney(text) {
  const m = /^([¥$]|[A-Z]{3} )(-?)([\d,]+(?:\.\d+)?)$/.exec(text || '');
  if (!m) return text;
  const v = Number(m[3].replace(/,/g, ''));
  if (v > 0 && v < 0.01) return m[2] + m[1] + '<0.01';
  return m[2] + m[1] + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The window or balance an account is judged by: the same slots and rule as the menu-bar icon (T7.9 / T7.11).
const SUMMARIES = structuredClone(previewSummaries());
// Mock only: the preview has no alerting account, so OpenCode Go's weekly window is set to 12% to show the amber state.
for (const w of SUMMARIES.find((s) => s.id === 'opencode-go')?.parts?.credits?.windows || [])
  if (w.label === '本周额度') Object.assign(w, { remainingPercent: 12, usedPercent: 88 });
const STATE = panelState(SUMMARIES, { threshold: 20 });
function focusOf(a) {
  const slots = slotsOf(SUMMARIES.find((s) => s.id === a.id), 20);
  const f = focusSlot(slots);
  if (!f) return { kind: 'none', label: '—', percent: null, text: '—', tone: 'normal', window: null, resetAt: null, slots };
  const window = f.kind === 'window';
  return {
    kind: f.kind,
    id: f.id,
    label: f.label,
    percent: window ? f.percent : null,
    text: window ? f.text : compactMoney(f.text),
    tone: f.tone,
    window: f.window || null,
    resetAt: f.resetAt,
    slots,
  };
}
const minLeft = (f) =>
  f.slots.reduce((m, s) => (s.kind === 'window' && s.percent !== null ? Math.min(m, s.percent) : m), Infinity);
// Alerts first (red, then amber; earlier reset first), then the least left; unknowns last; then list order.
function ranked(state) {
  return state.accounts
    .map((a, order) => ({ a, order, f: focusOf(a) }))
    .sort(
      (x, y) =>
        LEVEL[y.f.tone] - LEVEL[x.f.tone] ||
        (LEVEL[x.f.tone] > 0 ? cmp(x.f.resetAt ?? Infinity, y.f.resetAt ?? Infinity) : 0) ||
        cmp(minLeft(x.f), minLeft(y.f)) ||
        x.order - y.order,
    );
}
const resetText = (f) =>
  f.window
    ? resetDescription(f.window, NOW)
    : f.resetAt
      ? '账期至 ' + new Date(f.resetAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      : f.kind === 'balance'
        ? '无重置窗口'
        : '—';
const attention = (list) => list.filter((r) => r.f.tone !== 'normal').length;


/* ---------- T11.1 layout A: a grid at the top of the overview ---------- */
function Tile({ r, selected }) {
  const { a, f } = r;
  return (
    <button className={'aa-tile' + (selected ? ' selected' : '')} aria-pressed={selected}>
      <span className="aa-tile-head">
        <i className={'status-dot ' + (f.tone === 'normal' ? '' : f.tone)} />
        <span className="aa-name">{name(a)}</span>
        {a.stale && <span className="aa-stale">上次的值</span>}
      </span>
      <span className="aa-tile-value">
        <span className="aa-label">{f.label}</span>
        <strong className={'mono ' + (f.tone === 'normal' ? '' : f.tone + '-text')}>{f.text}</strong>
      </span>
      {f.kind === 'window' ? (
        <Bar value={f.percent} label={f.label + ' 剩余'} tone={barTone[f.tone]} small />
      ) : (
        <span className="aa-nobar" />
      )}
      <span className="aa-reset">
        <Clock size={12} />
        {resetText(f)}
      </span>
    </button>
  );
}
function AllAccountsGrid({ state }) {
  const list = ranked(state);
  const warn = attention(list);
  return (
    <section className="aa-section">
      <div className="aa-heading">
        <div className="section-title">
          ALL ACCOUNTS <span className="label-cn">/ 全部账户</span>
        </div>
        <span className="aa-summary">
          {list.length} 个账户 · {warn ? warn + ' 个需注意' : '都在阈值以上'} · 按剩余最少排序，点选查看详情
        </span>
      </div>
      <div className="aa-grid">
        {list.map((r) => (
          <Tile key={r.a.id} r={r} selected={r.a.id === 'commandcode'} />
        ))}
      </div>
    </section>
  );
}

function Shell({ active, crumb, children }) {
  return (
    <div className={'app native-app' + (dark ? ' dark' : '')}>
      <div className="app-shell">
        <aside className="rail" aria-label="主导航">
          <button className="app-mark" aria-label="返回用量总览">
            <BrandMark size={27} />
          </button>
          <div className="rail-nav">
            {[
              ['overview', ChartBar],
              ...(view === 'b' ? [['all', Rows]] : []),
              ['analytics', SquaresFour],
              ['coverage', ArrowsLeftRight],
              ['settings', GearSix],
            ].map(([id, Icon]) => (
              <button key={id} className={'icon-button' + (id === active ? ' active' : '')} aria-label={id}>
                <Icon size={21} />
              </button>
            ))}
          </div>
          <div className="rail-bottom">
            <button className="icon-button" aria-label="主题">
              <Moon size={20} />
            </button>
            <button className="icon-button" aria-label="口径">
              <Info size={20} />
            </button>
          </div>
        </aside>
        <div className="app-body">
          <header className="titlebar">
            <div className="breadcrumb">
              <span className="brand">Token 用量助手</span>
              <span className="slash">/</span>
              <span>{crumb}</span>
              <span className="desktop-badge">DESKTOP</span>
            </div>
            <div className="window-actions">
              <span className="version-tag">v1.9.0</span>
            </div>
          </header>
          <main className="main-content">{children}</main>
        </div>
      </div>
    </div>
  );
}

function LayoutA({ state }) {
  return (
    <Shell active="overview" crumb="Usage">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR USAGE, AT A GLANCE</div>
          <h1>
            <span>//</span>用量总览
          </h1>
          <p>掌握使用节奏，安心专注下一次创作。</p>
        </div>
        <div className="heading-actions">
          <button className="button">
            <ArrowsClockwise size={15} />
            刷新
          </button>
          <button className="button primary">
            <PushPin size={15} />
            显示悬浮窗
          </button>
        </div>
      </div>
      <AllAccountsGrid state={state} />
      <div className="aa-divider">
        <span className="section-title">
          CURRENT ACCOUNT <span className="label-cn">/ 当前账户</span>
        </span>
        <span className="aa-current">Command Code · 示例</span>
        <span className="aa-hint">以下保持现有的单账户详情（月度额度、额度窗口、Token、费用……），不改动</span>
      </div>
      <div className="panel aa-ghost" aria-hidden="true">
        <div />
        <div />
      </div>
    </Shell>
  );
}

/* ---------- T11.1 layout B: a page of its own ---------- */
function LayoutB({ state }) {
  const list = ranked(state);
  const warn = attention(list);
  return (
    <Shell active="all" crumb="Accounts">
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVERY ACCOUNT, SIDE BY SIDE</div>
          <h1>
            <span>//</span>全部账户
          </h1>
          <p>所有连接一屏对照，按剩余最少排序。各账户的额度与余额分开计算，不相加。</p>
        </div>
        <div className="heading-actions">
          <button className="button">
            <ArrowsClockwise size={15} />
            全部刷新
          </button>
        </div>
      </div>
      <div className="aa-table-meta">
        <span>
          {list.length} 个账户 · {warn ? warn + ' 个需注意' : '都在阈值以上'}
        </span>
        <span>点一行进入该账户的详情</span>
      </div>
      <div className="panel aa-table-wrap">
        <table className="aa-table">
          <thead>
            <tr>
              <th>账户</th>
              <th>最紧的额度</th>
              <th className="aa-num">剩余</th>
              <th>重置</th>
              <th>其他窗口</th>
              <th className="aa-num">余额</th>
              <th>更新</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ a, f }) => {
              const others = f.slots.filter((s) => s.kind === 'window' && s.id !== f.id);
              const balance = a.balances.length
                ? a.balances.map((b) => compactMoney(b.text)).join(' · ')
                : a.cells.balance.value === '—'
                  ? '—'
                  : compactMoney(a.cells.balance.value);
              return (
                <tr key={a.id} className={a.id === 'commandcode' ? 'selected' : ''}>
                  <td>
                    <span className="aa-cell-name">
                      <i className={'status-dot ' + (f.tone === 'normal' ? '' : f.tone)} />
                      <span>
                        <b>{name(a)}</b>
                        <small>{platform(a)}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="aa-cell-focus">
                      <span>{f.label}</span>
                      {f.kind === 'window' ? (
                        <Bar value={f.percent} label={f.label + ' 剩余'} tone={barTone[f.tone]} small />
                      ) : (
                        <small className="aa-muted">按量余额</small>
                      )}
                    </span>
                  </td>
                  <td className={'aa-num mono ' + (f.tone === 'normal' ? '' : f.tone + '-text')}>{f.text}</td>
                  <td className="aa-muted">{resetText(f)}</td>
                  <td className="aa-muted">
                    {others.length ? others.map((s) => s.label.replace('窗口', '') + ' ' + s.text).join(' · ') : '—'}
                  </td>
                  <td className="aa-num mono">{balance}</td>
                  <td className="aa-muted">{a.stale ? '上次的值' : '刚刚'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="aa-foot">
        <Info size={14} />
        平台额度、按量余额与本机工具用量分别统计，不相加；缺失显示「—」。
      </p>
    </Shell>
  );
}

/* ---------- T11.1 floating widget: collapsed shows the tightest account, expanded lists all ---------- */
function Widget({ state, expanded }) {
  const list = ranked(state);
  const top = list[0];
  const warn = attention(list.slice(1));
  return (
    <div className={'app native-widget' + (dark ? ' dark' : '')}>
      <aside className="floating-widget" aria-label="用量悬浮窗">
        <div className="widget-header">
          <span>
            <BrandMark size={17} />
            Usage
          </span>
          <div>
            <button className="icon-button" aria-label="刷新">
              <ArrowsClockwise size={14} />
            </button>
            <button className="icon-button" aria-label="固定">
              <PushPin size={14} />
            </button>
            <button className="icon-button" aria-label="关闭">
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="widget-body">
          <div className="aa-w-account">
            <span>
              <i className={'status-dot ' + (top.f.tone === 'normal' ? '' : top.f.tone)} />
              {name(top.a)}
            </span>
            <small>最紧</small>
          </div>
          <div className="widget-row">
            <span>
              {top.f.label}
              <span className="micro-label">剩余</span>
            </span>
            <strong className={'mono ' + (top.f.tone === 'normal' ? '' : top.f.tone + '-text')}>{top.f.text}</strong>
          </div>
          {top.f.kind === 'window' && (
            <Bar value={top.f.percent} label={top.f.label + ' 剩余'} tone={barTone[top.f.tone]} small />
          )}
          <div className="widget-reset">
            <Clock size={12} />
            {resetText(top.f)}
          </div>
          {expanded && (
            <section className="widget-extra aa-w-list" aria-label="全部账户">
              <div className="widget-extra-title">
                全部账户<span>按剩余最少</span>
              </div>
              {list.slice(1).map(({ a, f }) => (
                <div className="aa-w-row" key={a.id}>
                  <span className="aa-w-name">
                    <i className={'status-dot ' + (f.tone === 'normal' ? '' : f.tone)} />
                    {name(a)}
                  </span>
                  <span className="aa-w-label">{f.kind === 'window' ? f.label.replace('窗口', '') : '余额'}</span>
                  <b className={'mono ' + (f.tone === 'normal' ? '' : f.tone + '-text')}>{f.text}</b>
                </div>
              ))}
            </section>
          )}
        </div>
        <div className="widget-status">
          <span className={'status-dot ' + (warn ? 'amber' : '')} />
          {expanded ? '额度更新 刚刚' : `另 ${list.length - 1} 个账户${warn ? '，其中 ' + warn + ' 个需注意' : '都在阈值以上'}`}
        </div>
        <div className="widget-footer">
          <button aria-expanded={expanded}>
            {expanded ? '收起' : '展开全部账户'}
            {expanded ? <CaretUp size={13} /> : <CaretDown size={13} />}
          </button>
          <button>
            详细面板
            <ArrowUpRight size={13} />
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ---------- T11.3 panel after: empty cells folded, pace line, compact amounts in chips ---------- */
const PACE = {
  commandcode: { tone: 'amber', text: '按最近 42 分钟的速度，5 小时窗口约 1 小时 50 分钟后触顶（早于重置）' },
};
function PanelAfter({ state, accountId, before = false }) {
  const accounts = state.accounts;
  const account = accounts.find((a) => a.id === accountId) || accounts[0];
  const cells = [
    ['tokens', account.cells.tokens],
    ['cost', account.cells.cost],
    ['balance', account.cells.balance],
  ].filter(([, c]) => before || !(c.value === '—' && c.note === '平台未提供'));
  const pace = !before && PACE[account.provider];
  // T11.3: the window the chip stands for is always among the rows (today it can hide behind "还有 N 个窗口").
  const f = focusOf(account);
  let rows = account.rows;
  if (!before && f.kind === 'window' && !rows.some((r) => r.id === f.id))
    rows = [...rows.slice(0, -1), { id: f.id, label: f.label, percent: f.percent, text: f.text, tone: f.tone, window: f.window }];
  const ordered = [account, ...accounts.filter((a) => a !== account)].slice(0, 6);
  return (
    <div className={'app panel-root aa-panel' + (dark ? ' dark' : '')}>
      <main className="panel-card">
        <header className="panel-head">
          <span className="panel-account">
            <i className={'panel-dot ' + account.chip.tone} />
            <span className="panel-name">{account.label}</span>
            <small>{platform(account)}</small>
          </span>
          <span className="panel-muted">刚刚更新</span>
        </header>
        <section className="panel-section">
          {rows.map((row) => (
            <div className="panel-row" key={row.id}>
              <div className="panel-row-meta">
                <span className="panel-muted">{row.label}</span>
                <span className={'panel-pct ' + row.tone}>{row.text}</span>
              </div>
              <Bar value={row.percent} label={row.label + ' 剩余'} tone={barTone[row.tone]} small />
              <div className="panel-muted panel-reset">{row.window ? resetDescription(row.window, NOW) : '—'}</div>
            </div>
          ))}
          {account.balances.map((b) => (
            <div className="panel-balance" key={b.currency}>
              <span className="panel-muted">{b.currency} 余额</span>
              <b>{b.text}</b>
            </div>
          ))}
          {account.more > 0 && (
            <div className="panel-muted panel-more">还有 {account.more} 个窗口，在主窗口查看</div>
          )}
        </section>
        {pace && (
          <section className={'panel-section aa-pace ' + pace.tone}>
            <Timer size={14} />
            <span>
              <b>节奏</b>
              {pace.text}
            </span>
          </section>
        )}
        {cells.length > 0 && (
          <section className={'panel-section panel-cells aa-cells-' + cells.length}>
            {cells.map(([id, c]) => (
              <div className="panel-cell" key={id}>
                <small>{c.unit}</small>
                <b className={(id === 'tokens' ? 'token ' : '') + c.tone}>{c.value}</b>
                <em>{c.note}</em>
              </div>
            ))}
          </section>
        )}
        <section className="panel-section panel-chips">
          {ordered.map((a) => (
            <button key={a.id} className={'panel-chip' + (a.id === account.id ? ' selected' : '')}>
              <i className={'panel-dot ' + a.chip.tone} />
              {a.label}
              <span className="panel-mono">{before ? a.chip.text : compactMoney(a.chip.text)}</span>
            </button>
          ))}
          {accounts.length > 6 && (
            <button className="panel-chip">
              <span className="panel-mono">+{accounts.length - 6}</span>
            </button>
          )}
        </section>
        <footer className="panel-foot">
          <button className="panel-link">官方用量页 ›</button>
          <button className="panel-link">主窗口 ›</button>
        </footer>
      </main>
    </div>
  );
}

function PanelCompare({ state }) {
  return (
    <div className={'aa-stage wrap' + (dark ? ' dark' : '')}>
      <figure>
        <figcaption>现在 · OpenRouter</figcaption>
        <PanelAfter state={state} accountId="openrouter" before />
      </figure>
      <figure>
        <figcaption>改后 · OpenRouter（空格子折叠，胶囊金额两位）</figcaption>
        <PanelAfter state={state} accountId="openrouter" />
      </figure>
      <figure>
        <figcaption>改后 · Command Code（节奏行）</figcaption>
        <PanelAfter state={state} accountId="commandcode" />
      </figure>
      <figure>
        <figcaption>现在 · 火山：胶囊写 57%，最紧的窗口却藏在「还有 1 个窗口」里</figcaption>
        <PanelAfter state={state} accountId="volcengine" before />
      </figure>
      <figure>
        <figcaption>改后 · 火山：最紧的窗口总在列表里</figcaption>
        <PanelAfter state={state} accountId="volcengine" />
      </figure>
    </div>
  );
}

/* ---------- T11.2 Windows: tray icon states, tooltip, the panel above the taskbar ---------- */
const MARK = /\sd="([^"]+)"/.exec(markSvg)?.[1] || '';
function wedge(ratio) {
  const start = (-84 * Math.PI) / 180,
    end = start + Math.min(1, ratio) * 2 * Math.PI,
    p = (t) => [256 + 400 * Math.cos(t), 256 + 400 * Math.sin(t)];
  const [x1, y1] = p(start),
    [x2, y2] = p(end);
  return `M256 256 L${x1} ${y1} A400 400 0 ${ratio > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`;
}
function TrayRing({ ratio, tone, size = 16, id }) {
  const color = { normal: 'var(--tray-fg)', amber: 'var(--amber)', red: 'var(--red)' }[tone];
  // At 16px a thin lit share is hard to see, so an alert also tints the whole track; exhausted is all red.
  const track =
    tone === 'red'
      ? 'var(--red)'
      : tone === 'amber'
        ? 'color-mix(in srgb, var(--amber) 40%, transparent)'
        : 'var(--tray-track)';
  return (
    <svg width={size} height={size} viewBox="-32 -32 576 576" aria-hidden="true">
      <defs>
        <clipPath id={'w' + id}>
          <path d={wedge(ratio ?? 0)} />
        </clipPath>
      </defs>
      <path d={MARK} fillRule="evenodd" fill={track} />
      {ratio > 0 && <path d={MARK} fillRule="evenodd" fill={color} clipPath={`url(#w${id})`} />}
    </svg>
  );
}
function WindowsScene({ state }) {
  const list = ranked(state);
  const top = list[0];
  const tip = [
    'Token 用量助手',
    ...list.slice(0, 3).map(({ a, f }) => `${name(a)} ${f.text}`),
    `另 ${list.length - 3} 个账户`,
  ];
  const states = [
    ['正常', 0.62, 'normal'],
    ['低于阈值', 0.14, 'amber'],
    ['用尽', 0, 'red'],
    ['没有数据', null, 'normal'],
  ];
  return (
    <div className={'app win-scene' + (dark ? ' dark' : '')}>
      <div className="win-notes">
        <div className="win-card">
          <div className="section-title">TRAY ICON / 托盘图标</div>
          <div className="win-states">
            {states.map(([label, ratio, tone], i) => (
              <div key={label}>
                <span className="win-zoom">
                  <TrayRing ratio={ratio} tone={tone} size={48} id={'z' + i} />
                </span>
                <span className="win-actual">
                  <TrayRing ratio={ratio} tone={tone} id={'a' + i} />
                </span>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <p>
            16px 只画刻度环，不画数字（每格下方是实际大小）。亮起的部分 = 最紧账户的剩余；低于阈值时整环带黄，用尽时整环变红，没有数据时只有灰环。
          </p>
        </div>
        <div className="win-card">
          <div className="section-title">TOOLTIP / 悬停提示</div>
          <pre className="win-tip">{tip.join('\n')}</pre>
          <p>Windows 托盘提示约 127 个字符上限：只列最紧的几个，其余写「另 N 个」。</p>
        </div>
        <div className="win-card">
          <div className="section-title">FIRST RUN / 首次运行</div>
          <p>
            Windows 11 默认把新图标收进任务栏的「^」里。首次运行时在主窗口提示：任务栏设置 → 其他系统托盘图标 → 打开「Token
            用量助手」。只给说明，不改系统设置。
          </p>
        </div>
      </div>
      <div className="win-desktop">
        <div className="win-panel">
          <PanelAfter state={state} accountId={top.a.id} />
        </div>
        <div className="win-taskbar">
          <span className="win-start">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="win-tray">
            <span className="win-chevron">⌃</span>
            <span className="win-ours" title={tip.join('\n')}>
              <TrayRing ratio={top.f.percent === null ? null : top.f.percent / 100} tone={top.f.tone} id="tb" />
            </span>
            <span className="win-sys">ENG</span>
            <span className="win-clock">
              15:20
              <br />
              2026/10/29
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const state = STATE;
  if (view === 'b') return <LayoutB state={state} />;
  if (view === 'widget')
    return (
      <div className={'aa-stage' + (dark ? ' dark' : '')}>
        <figure>
          <figcaption>收起：只看最紧的账户</figcaption>
          <Widget state={state} expanded={false} />
        </figure>
        <figure>
          <figcaption>展开：全部账户</figcaption>
          <Widget state={state} expanded />
        </figure>
      </div>
    );
  if (view === 'panel') return <PanelCompare state={state} />;
  if (view === 'win') return <WindowsScene state={state} />;
  return <LayoutA state={state} />;
}

createRoot(document.getElementById('root')).render(<App />);
