import { useEffect, useState } from 'react';
import { ArrowUpRight, Lightning, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { Disclosure } from './Disclosure.jsx';
import { kindName } from './ToolSources.jsx';
import { t } from './i18n.js';
import './local-tools.css';

// T16.2 (D23 ②④): the overview's second half — what the local tools used today and over the last 7 days, per
// source. These are local tool statistics, kept apart from the account data above and never added to it (AGENTS §2).
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const compact = (v) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const count = (v) => (num(v) ? v.toLocaleString('en-US') : '—');

// Tokens as the tools reported them: the full total when every record has one, otherwise the known part, marked;
// nothing observed stays "—", never 0.
function tokens(row) {
  if (!row) return { text: '—', partial: false };
  if (num(row.total)) return { text: compact(row.total), partial: false };
  if (num(row.knownTokens) && row.knownTokens > 0) return { text: compact(row.knownTokens), partial: true };
  return { text: '—', partial: false };
}

function Total({ label, report, loading }) {
  const s = report?.summary,
    value = tokens(s);
  return (
    <div className="lt-total">
      <span className="micro-label">{label}</span>
      <strong className="mono">{loading && !report ? '…' : value.text}</strong>
      <small>
        Token
        {value.partial ? t(' · 已知部分') : ''}
        {num(s?.requests) ? ` · ${t('{v0} 条记录', { v0: count(s.requests) })}` : ''}
      </small>
    </div>
  );
}

function statusOf(row) {
  if (!row) return { tone: 'muted', text: t('等待可用数据') };
  if (row.status === 'ready') return { tone: 'green', text: t('同步成功') };
  if (row.status === 'partial') return { tone: 'amber', text: t('部分数据') };
  return { tone: row.status === 'error' ? 'red' : 'muted', text: t(row.message) || t('等待可用数据') };
}

// T17.1 (D24 ①): tools found at their default location (T12.6 only checks that it exists) but not added yet. Adding
// still opens the system picker at that location, so the user confirms it (AGENTS §4).
const FOUND_NOTE = {
  'claude-code-logs': '桌面版和命令行的会话都记在这里，不需要启动脚本',
};
function Found({ found, pending, onAdd, onIgnore }) {
  if (!found.length) return null;
  return (
    <div className="lt-found" aria-label={t('本机发现、尚未添加')}>
      <div className="lt-found-head">
        <MagnifyingGlass size={14} />
        <span>{t('本机发现、尚未添加')}</span>
        <small>{t('点「添加」后在系统选择框里确认位置')}</small>
      </div>
      {found.map((item) => (
        <div className="lt-found-row" key={item.kind + item.path}>
          <span className="lt-name">
            <strong>{kindName(item.kind)}</strong>
            <small>
              <code>{item.path}</code>
              {FOUND_NOTE[item.kind] ? ' · ' + t(FOUND_NOTE[item.kind]) : ''}
            </small>
          </span>
          <span className="lt-found-actions">
            <button className="text-button" disabled={!!pending} onClick={() => onIgnore(item.kind)}>
              {t('不再提示')}
            </button>
            <button className="button" disabled={!!pending} onClick={() => onAdd(item.kind)}>
              <Plus size={14} />
              {pending === item.kind ? t('正在添加') : t('添加')}
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

// `report` is the 7-day tools report; its `today` part (same dedup and filters) gives the today column.
export function LocalToolsOverview({
  sources = [],
  report,
  loading,
  onDetails,
  onManage,
  onDiscover,
  onAdd,
  ignored = [],
  onIgnore,
}) {
  const [found, setFound] = useState([]),
    [pending, setPending] = useState(null);
  // Looked up again whenever a source is added or removed, like the settings' tool list.
  useEffect(() => {
    let live = true;
    onDiscover?.().then((r) => live && r?.ok && setFound(r.value.filter((f) => !f.added)));
    return () => {
      live = false;
    };
  }, [onDiscover, sources.length]);
  const add = async (kind) => {
    setPending(kind);
    try {
      await onAdd?.(kind);
    } finally {
      setPending(null);
    }
  };
  const shown = found.filter((f) => !ignored.includes(f.kind)),
    hidden = found.length - shown.length;
  const enabled = sources.filter((s) => s.enabled),
    usable = report?.summary ? report : null;
  const byId = (part) => new Map((part?.bySource || []).map((row) => [row.id, row])),
    todayRows = byId(usable?.today),
    weekRows = byId(usable),
    reports = new Map((report?.sourceReports || []).map((row) => [row.id, row]));
  return (
    <section className="panel lt-section" aria-label={t('本机工具用量')}>
      <div className="lt-head">
        <div className="section-title purple-text">
          <Lightning size={16} />
          <span>
            LOCAL TOOLS <span className="label-cn">{t('/ 本机工具用量')}</span>
          </span>
        </div>
        <span className="subtle-label">
          <Disclosure
            summary={t('本机工具统计，不与上面的账户相加')}
            detail={t(
              '来自本机编程工具自己记下的用量（已报告的 Token），只覆盖已添加的来源和它们记录到的时段，不是账户数据，也不是账单。默认不归属任何账户。',
            )}
          />
        </span>
      </div>
      {!enabled.length ? (
        <div className="lt-empty">
          <p>{t('还没有添加本机工具。添加后，这里显示 Claude Code、Codex 等工具今天和最近 7 天用了多少 Token。')}</p>
          <button className="button" onClick={onManage}>
            <Plus size={15} />
            {t('添加本机工具')}
          </button>
        </div>
      ) : null}
      <Found found={shown} pending={pending} onAdd={add} onIgnore={(kind) => onIgnore?.([...ignored, kind])} />
      {!enabled.length ? null : (
        <>
          <div className="lt-totals">
            <Total label={t('今天')} report={usable?.today} loading={loading} />
            <Total label={t('近 7 天')} report={usable} loading={loading} />
          </div>
          <div className="lt-table" role="table" aria-label={t('各来源用量')}>
            <div className="lt-row lt-row-head" role="row">
              <span role="columnheader">{t('来源')}</span>
              <span role="columnheader">{t('今天')}</span>
              <span role="columnheader">{t('近 7 天')}</span>
              <span role="columnheader">{t('状态')}</span>
            </div>
            {enabled.map((source) => {
              const d = tokens(todayRows.get(source.id)),
                w = tokens(weekRows.get(source.id)),
                status = statusOf(reports.get(source.id));
              return (
                <div className="lt-row" role="row" key={source.id}>
                  <span role="cell" className="lt-name">
                    <strong>{source.label || kindName(source.kind)}</strong>
                    {source.label && source.label !== kindName(source.kind) && <small>{kindName(source.kind)}</small>}
                  </span>
                  <span role="cell" className="mono">
                    {d.text}
                    {d.partial && <small>{t('已知部分')}</small>}
                  </span>
                  <span role="cell" className="mono">
                    {w.text}
                    {w.partial && <small>{t('已知部分')}</small>}
                  </span>
                  <span role="cell" className={`lt-status ${status.tone}`}>
                    <i />
                    {status.text}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="lt-foot">
            <span className="lt-foot-left">
              <button className="text-button" onClick={onManage}>
                {t('管理本机工具')}
              </button>
              {hidden > 0 && (
                <button className="text-button" onClick={() => onIgnore?.([])}>
                  {t('显示已忽略的 {v0} 个发现', { v0: hidden })}
                </button>
              )}
            </span>
            <button className="text-button" onClick={onDetails}>
              {t('查看明细')}
              <ArrowUpRight size={13} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
