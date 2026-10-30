import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import { previewPanelBridge } from './desktop-preview.js';
import { Bar } from './ProviderViews.jsx';
import { Live } from './Live.jsx';
import { resetDescription } from './generated/domain.js';
import { providerInfo } from './generated/provider-catalog.js';
import './panel.css';

// Menu-bar / tray popover panel (T7.6 macOS, T11.2 Windows). Approved mock: docs/island-1.9.0-design/menubar-proposals.html
// (§三); Windows: docs/design/T11-glance/.
// - Opens on the account the menu-bar icon shows; picking another account here only changes this panel.
// - The three cells show the account's own interface data only; local tool statistics never appear here.
const bridge = window.tokenAssistant || previewPanelBridge;
const barTone = { normal: 'green', amber: 'amber', red: 'red' };
const CHIPS = 6; // accounts listed before "+N"; up to 20 accounts are possible

function ago(at, now) {
  if (!at) return '尚未同步';
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return '刚刚更新';
  if (minutes < 60) return minutes + ' 分钟前更新';
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? hours + ' 小时前更新' : Math.floor(hours / 24) + ' 天前更新';
}

function Row({ row }) {
  return (
    <div className="panel-row">
      <div className="panel-row-meta">
        <span className="panel-muted">{row.label}</span>
        <span className={'panel-pct ' + row.tone}>{row.text}</span>
      </div>
      <Bar value={row.percent} label={row.label + ' 剩余'} tone={barTone[row.tone]} small />
      <div className="panel-muted panel-reset">
        {row.window ? <Live>{(now) => resetDescription(row.window, now)}</Live> : '—'}
      </div>
    </div>
  );
}

function Cell({ cell, token = false }) {
  return (
    <div className="panel-cell">
      <small>{cell.unit}</small>
      <b className={(token && cell.value !== '—' ? 'token ' : '') + cell.tone}>{cell.value}</b>
      <em>{cell.note}</em>
    </div>
  );
}

export function Panel() {
  const [view, setView] = useState(null);
  // { id, session }: an account picked in this panel; only valid while the panel stays open (same openedAt).
  const [pick, setPick] = useState(null);
  // The full account list is expanded for this opening only (same openedAt), like the picked account.
  const [expanded, setExpanded] = useState(0);
  const [error, setError] = useState('');
  const card = useRef(null);

  useEffect(() => {
    let live = true;
    bridge.panelState().then((r) => live && r.ok && setView(r.value));
    const off = bridge.onPanel((value) => setView(value));
    bridge.ready();
    return () => {
      live = false;
      off();
    };
  }, []);

  useLayoutEffect(() => {
    if (card.current) bridge.panelResize(Math.ceil(card.current.getBoundingClientRect().height));
  });

  if (!view) return null;
  const dark = view.theme === 'dark';
  const accounts = view.accounts || [];
  // Each time the panel opens it starts from the account the menu-bar icon shows.
  const selected = pick && pick.session === view.openedAt ? pick.id : view.defaultAccountId;
  const account = accounts.find((a) => a.id === selected) || accounts[0] || null;
  const showAll = expanded === view.openedAt || accounts.length <= CHIPS;
  // The account being viewed comes first, then the others in their usual order.
  const ordered = account ? [account, ...accounts.filter((a) => a !== account)] : accounts;
  const chips = showAll ? ordered : ordered.slice(0, CHIPS);
  const open = async (fn) => {
    setError('');
    const r = await fn();
    if (!r?.ok) setError(r?.error || '操作未完成，请重试。');
  };

  return (
    <div className={'app panel-root' + (dark ? ' dark' : '')}>
      {/* macOS points an arrow at the menu-bar icon; the Windows panel sits against the taskbar without one (T11.2). */}
      {(view.arrow ?? 8) > 0 && <div className="panel-arrow" style={{ left: (view.anchorX ?? 180) - 6 }} />}
      <main className="panel-card" ref={card} style={{ marginTop: view.arrow ?? 8 }}>
        {!account ? (
          <section className="panel-empty">
            <p>还没有连接账户。</p>
            <button className="panel-link" onClick={() => open(() => bridge.panelMain())}>
              打开主窗口连接 ›
            </button>
          </section>
        ) : (
          <>
            <header className="panel-head">
              <span className="panel-account">
                <i className={'panel-dot ' + account.chip.tone} />
                <span className="panel-name">{account.label}</span>
                <small>{providerInfo(account.provider)?.name || account.provider}</small>
              </span>
              <span className="panel-muted">
                <Live intervalMs={30000}>{(now) => ago(account.updatedAt, now)}</Live>
              </span>
            </header>
            {account.notice && <div className="panel-stale">{account.notice}</div>}
            <section className="panel-section">
              {account.rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
              {account.balances.map((b) => (
                <div className="panel-balance" key={b.currency}>
                  <span className="panel-muted">{b.currency} 余额</span>
                  <b>{b.text}</b>
                </div>
              ))}
              {account.balances.length > 0 && (
                <div className="panel-muted panel-reset">
                  {account.available === false
                    ? '平台标记为当前不可用于调用'
                    : account.available
                      ? '可用于调用 · 无重置窗口'
                      : '可用状态未返回 · 无重置窗口'}
                </div>
              )}
              {!account.rows.length && !account.balances.length && <div className="panel-muted">额度数据暂缺</div>}
              {account.more > 0 && (
                <div className="panel-muted panel-more">还有 {account.more} 个窗口，在主窗口查看</div>
              )}
            </section>
            <section className="panel-section panel-cells">
              <Cell cell={account.cells.tokens} token />
              <Cell cell={account.cells.cost} />
              <Cell cell={account.cells.balance} />
            </section>
            {accounts.length > 1 && (
              <section className="panel-section panel-chips" aria-label="切换面板中查看的账户">
                {chips.map((a) => (
                  <button
                    key={a.id}
                    className={'panel-chip' + (a.id === account.id ? ' selected' : '')}
                    aria-pressed={a.id === account.id}
                    onClick={() => setPick({ id: a.id, session: view.openedAt })}
                  >
                    <i className={'panel-dot ' + a.chip.tone} />
                    {a.label}
                    <span className="panel-mono">{a.chip.text}</span>
                  </button>
                ))}
                {!showAll && (
                  <button className="panel-chip" onClick={() => setExpanded(view.openedAt)}>
                    <span className="panel-mono">+{accounts.length - chips.length}</span>
                  </button>
                )}
              </section>
            )}
            <footer className="panel-foot">
              {view.officials?.[account.id] ? (
                <button className="panel-link" onClick={() => open(() => bridge.panelOfficial(account.id))}>
                  官方用量页 ›
                </button>
              ) : (
                <span />
              )}
              {error && <span className="panel-error">{error}</span>}
              <button className="panel-link" onClick={() => open(() => bridge.panelMain())}>
                主窗口 ›
              </button>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
