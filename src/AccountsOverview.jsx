// T11.1 all-accounts view (D17, layout A confirmed 2026-10-30; mock: docs/design/T11-glance/). The list, its order and
// the value per account come from desktop/account-overview.cjs (the menu-bar rule); nothing is ranked or summed here.
import { Clock } from '@phosphor-icons/react';
import { Bar } from './ProviderViews.jsx';
import { Live } from './Live.jsx';
import { resetDescription } from './generated/domain.js';
import './accounts-overview.css';

const barTone = { normal: 'green', amber: 'amber', red: 'red' };
const textTone = (tone) => (tone === 'normal' ? '' : tone + '-text');
const dot = (tone) => 'status-dot ' + (tone === 'normal' ? '' : tone);
const stamp = (v) =>
  v
    ? new Date(v).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

// Where the shown value resets: a window's own description, a monthly balance's billing period, or none.
export function resetText(focus, now) {
  if (!focus) return '—';
  if (focus.window) return resetDescription(focus.window, now);
  if (focus.resetAt)
    return '账期至 ' + new Date(focus.resetAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  return focus.kind === 'balance' ? '无重置窗口' : '—';
}
// A failed refresh keeps the last successful values; say so, with their time (AGENTS §2).
function staleNote(row) {
  if (!row.stale) return null;
  return row.synced
    ? { text: '上次的值', title: '刷新未成功，显示 ' + stamp(row.updatedAt) + ' 的值' }
    : { text: '尚未同步' };
}
export const attentionText = (n) => (n ? n + ' 个需注意' : '暂无告警');

function Tile({ row, disabled, onSelect }) {
  const f = row.focus,
    note = staleNote(row);
  return (
    <button
      className={'aa-tile' + (row.active ? ' selected' : '')}
      aria-pressed={row.active}
      disabled={disabled}
      onClick={() => !row.active && onSelect(row.id)}
    >
      <span className="aa-tile-head">
        <i className={dot(row.tone)} />
        <span className="aa-name" title={row.label}>
          {row.label}
        </span>
        {note && (
          <span className="aa-stale" title={note.title}>
            {note.text}
          </span>
        )}
      </span>
      <span className="aa-tile-value">
        <span className="aa-label">{f?.label || '—'}</span>
        <strong className={'mono ' + textTone(row.tone)}>{f?.text || '—'}</strong>
      </span>
      {f?.kind === 'window' ? (
        <Bar value={f.percent} label={f.label + ' 剩余'} tone={barTone[f.tone]} small />
      ) : (
        <span className="aa-nobar" />
      )}
      <span className="aa-reset">
        <Clock size={12} />
        <Live>{(now) => resetText(f, now)}</Live>
      </span>
    </button>
  );
}

export function AllAccountsGrid({ overview, disabled, onSelect }) {
  const rows = overview.rows;
  return (
    <section className="aa-section" aria-label="全部账户">
      <div className="aa-heading">
        <div className="section-title">
          ALL ACCOUNTS <span className="label-cn">/ 全部账户</span>
        </div>
        <span className="aa-summary">
          {rows.length} 个账户 · {attentionText(overview.attention)} · 按剩余最少排序，点选查看详情
        </span>
      </div>
      <div className="aa-grid">
        {rows.map((row) => (
          <Tile key={row.id} row={row} disabled={disabled} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

// Floating widget with two or more accounts: the tightest account; expanded, every other account below it.
export function GlanceWidget({ overview, expanded }) {
  const [top, ...rest] = overview.rows,
    f = top.focus,
    note = staleNote(top);
  return (
    <>
      <div className="aa-w-account">
        <span>
          <i className={dot(top.tone)} />
          <span className="aa-name" title={top.label}>
            {top.label}
          </span>
        </span>
        <small title={note?.title}>{note ? note.text : '最紧'}</small>
      </div>
      <div className="widget-row">
        <span>
          {f?.label || '—'}
          {f?.kind === 'window' && <span className="micro-label">剩余</span>}
        </span>
        <strong className={'mono ' + textTone(top.tone)}>{f?.text || '—'}</strong>
      </div>
      {f?.kind === 'window' && <Bar value={f.percent} label={f.label + ' 剩余'} tone={barTone[f.tone]} small />}
      <div className="widget-reset">
        <Clock size={12} />
        <Live>{(now) => resetText(f, now)}</Live>
      </div>
      {expanded && (
        <section className="widget-extra aa-w-list" aria-label="全部账户">
          <div className="widget-extra-title">
            全部账户<span>按剩余最少</span>
          </div>
          {rest.map((row) => {
            const n = staleNote(row);
            return (
              <div className="aa-w-row" key={row.id} title={n?.title || n?.text}>
                <span className="aa-w-name">
                  <i className={dot(row.tone)} />
                  <span className="aa-name">{row.label}</span>
                </span>
                <span className={'aa-w-label' + (n ? ' stale' : '')}>
                  {n
                    ? n.text
                    : row.focus?.kind === 'window'
                      ? row.focus.label.replace(/窗口$/, '')
                      : row.focus
                        ? '余额'
                        : '—'}
                </span>
                <b className={'mono ' + textTone(row.tone)}>{row.focus?.text || '—'}</b>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
