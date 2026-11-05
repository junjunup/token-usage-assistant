// T11.1 all-accounts view (D17, layout A confirmed 2026-10-30; mock: docs/design/T11-glance/). The list, its order and
// the value per account come from desktop/account-overview.cjs (the menu-bar rule); nothing is ranked or summed here.
import { Clock } from '@phosphor-icons/react';
import { Bar } from './ProviderViews.jsx';
import { Live } from './Live.jsx';
import { resetDescription } from './generated/domain.js';
import './accounts-overview.css';
import { t, locale } from './i18n.js';

const barTone = { normal: 'green', amber: 'amber', red: 'red' };
const textTone = (tone) => (tone === 'normal' ? '' : tone + '-text');
const dot = (tone) => 'status-dot ' + (tone === 'normal' ? '' : tone);
const stamp = (v) =>
  v
    ? new Date(v).toLocaleString(locale(), {
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
  if (focus.window) return t(resetDescription(focus.window, now));
  if (focus.resetAt)
    return t('账期至 ') + new Date(focus.resetAt).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' });
  return focus.kind === 'balance' ? t('无重置窗口') : '—';
}
// A failed refresh keeps the last successful values; say so, with their time (AGENTS §2).
function staleNote(row) {
  if (!row.stale) return null;
  return row.synced
    ? { text: t('上次的值'), title: t('刷新未成功，显示 ') + stamp(row.updatedAt) + t(' 的值') }
    : { text: t('尚未同步') };
}
export const attentionText = (n) => (n ? n + t(' 个需注意') : t('暂无告警'));

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
            {t(note.text)}
          </span>
        )}
      </span>
      <span className="aa-tile-value">
        <span className="aa-label">{t(f?.label || '—')}</span>
        <strong className={'mono ' + textTone(row.tone)}>{t(f?.text || '—')}</strong>
      </span>
      {f?.kind === 'window' ? (
        <Bar value={f.percent} label={t(f.label) + t(' 剩余')} tone={barTone[f.tone]} small />
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
    <section className="aa-section" aria-label={t('全部账户')}>
      <div className="aa-heading">
        <div className="section-title">
          ALL ACCOUNTS <span className="label-cn">{t('/ 全部账户')}</span>
        </div>
        <span className="aa-summary">
          {rows.length} {t('个账户 ·')} {attentionText(overview.attention)} {t('· 按剩余最少排序，点选查看详情')}
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
        <small title={note?.title}>{note ? note.text : t('最紧')}</small>
      </div>
      <div className="widget-row">
        <span>
          {t(f?.label || '—')}
          {f?.kind === 'window' && <span className="micro-label">{t('剩余')}</span>}
        </span>
        <strong className={'mono ' + textTone(top.tone)}>{t(f?.text || '—')}</strong>
      </div>
      {f?.kind === 'window' && <Bar value={f.percent} label={t(f.label) + t(' 剩余')} tone={barTone[f.tone]} small />}
      <div className="widget-reset">
        <Clock size={12} />
        <Live>{(now) => resetText(f, now)}</Live>
      </div>
      {expanded && (
        <section className="widget-extra aa-w-list" aria-label={t('全部账户')}>
          <div className="widget-extra-title">
            {t('全部账户')}
            <span>{t('按剩余最少')}</span>
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
                      ? t(row.focus.label.replace(/窗口$/, ''))
                      : row.focus
                        ? t('余额')
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
