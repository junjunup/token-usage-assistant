import React, { useEffect, useRef, useState } from 'react';
import { Disclosure } from './Disclosure.jsx';
import Chart from 'chart.js/auto';
import {
  ChartLineUp,
  Lightning,
  Coins,
  Pulse,
  Database,
  ArrowUpRight,
  Folder,
  ChatCircle,
  DotsThree,
  ArrowClockwise,
  WarningCircle,
  Stack,
  Timer,
  SlidersHorizontal,
  X,
  Info,
  FileArrowDown,
} from '@phosphor-icons/react';
import './analytics.css';
import { t, locale } from './i18n.js';
import { Select } from './Select.jsx';

const n = (v) => typeof v === 'number' && Number.isFinite(v);
const number = (v) => (n(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—');
const compact = (v) =>
  n(v) ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : '—';
const money = (v, d = 2, currency = 'USD') =>
  n(v) && currency
    ? (currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : currency + ' ') +
      v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '—';
const percent = (v) => (n(v) ? number(v) + '%' : '—');
const stamp = (at) =>
  at
    ? new Date(at).toLocaleString(locale(), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : t('尚未同步');
const projectName = (p) => p?.split(/[\\/]/).filter(Boolean).at(-1) || t('未关联项目');
const sessionName = (id) => (id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id);
const change = (current, previous) =>
  !n(current) || !n(previous)
    ? t('暂无可比数据')
    : previous === 0
      ? current === 0
        ? t('与上期持平')
        : t('上期无记录')
      : t('{v0} {v1}% · 对比上一等长时段', {
          v0: current >= previous ? '↑' : '↓',
          v1: Math.abs(((current - previous) / previous) * 100).toFixed(1),
        });
export function RangeControl({
  value,
  onChange,
  billingAvailable = true,
  billingUnavailableReason = t('连接账户以确认账期'),
}) {
  return (
    <div className="range-control" role="group" aria-label={t('统计时间范围')}>
      {[
        ['today', t('今日')],
        ['7d', t('近 7 天')],
        ['billing', t('本账期')],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={value === id ? 'selected' : ''}
          aria-pressed={value === id}
          disabled={id === 'billing' && !billingAvailable}
          title={id === 'billing' && !billingAvailable ? t(billingUnavailableReason) : undefined}
          onClick={() => onChange(id)}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}
function Heading({ icon: Icon = ChartLineUp, title, caption, children }) {
  return (
    <div className="analysis-panel-heading">
      <div>
        <div className="analysis-eyebrow">
          <Icon size={15} />
          {caption}
        </div>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
function Empty({ text, action, label = t('查看工具分析') }) {
  return (
    <div className="analysis-empty">
      <Database size={27} />
      <strong>{text}</strong>
      {action && (
        <button className="button" onClick={action}>
          {label}
          <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}
function Stat({ label, value, note, icon: Icon = Lightning }) {
  return (
    <div className="analysis-stat">
      <div>
        <Icon size={15} />
        {label}
      </div>
      <strong className="mono">{value}</strong>
      <small>{note}</small>
    </div>
  );
}
export function HealthStrip({ summary: s, onOpen }) {
  return (
    <div className="overview-health">
      {[
        [t('请求成功率'), percent(s?.successRate)],
        [t('失败请求'), number(s?.failed)],
        [t('平均 Token / 请求'), compact(s?.averageTokens)],
        [
          t('平均费用 / 请求'),
          money(
            s?.averageCost,
            4,
            s?.averageCurrency === undefined ? (s?.currency === undefined ? 'USD' : s.currency) : s.averageCurrency,
          ),
        ],
      ].map(([label, value]) => (
        <div key={label}>
          <span>{t(label)}</span>
          <strong className="mono">{value}</strong>
        </div>
      ))}
      <button onClick={onOpen}>
        {t('更多分析')}
        <ArrowUpRight size={15} />
      </button>
    </div>
  );
}
function Health({ s, local }) {
  return (
    <section className="panel analytics-panel health-panel">
      <Heading icon={Pulse} caption="REQUEST HEALTH" title={t('请求健康')} />
      <div className="health-score">
        <strong className="mono">{percent(s?.successRate)}</strong>
        <span>{t('成功率')}</span>
      </div>
      <div className="health-track">
        <i style={{ width: n(s?.successRate) ? `${s.successRate}%` : '0%' }} />
      </div>
      <dl>
        {[
          [t('已完成'), s?.completed],
          [t('失败'), s?.failed],
          ...(local
            ? [
                [t('已取消'), s?.cancelled],
                [t('进行中 / 其他'), s?.pending],
              ]
            : []),
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="mono">{number(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="health-averages">
        <div>
          <span>{t('平均 Token / 请求')}</span>
          <strong className="mono">{compact(s?.averageTokens)}</strong>
        </div>
        <div>
          <span>
            {t('平均费用 / 请求')}
            {local ? t(' · 估算') : ''}
          </span>
          <strong className="mono">
            {money(
              s?.averageCost,
              4,
              s?.averageCurrency === undefined ? (s?.currency === undefined ? 'USD' : s.currency) : s.averageCurrency,
            )}
          </strong>
        </div>
      </div>
      <p className="analysis-note">
        {local ? (
          <Disclosure
            summary={t('成功率 = 已完成 /（已完成 + 失败）')}
            detail={t('取消与进行中单列。平均值只统计已完成请求；上方用量总计包含失败、取消请求已报告的用量。')}
          />
        ) : (
          t('成功率按接口返回的完成数 / 总请求数计算，字段缺失时不推算。')
        )}
      </p>
    </section>
  );
}
function Trend({ report, dark }) {
  const [metric, setMetric] = useState('tokens'),
    [table, setTable] = useState(false);
  const ref = useRef();
  const bins = report?.bins || [];
  const currency = report?.summary?.currency === undefined ? 'USD' : report.summary.currency;
  const mixed = Object.keys(report?.summary?.costsByCurrency || {}).length > 1;
  const valid = !(metric === 'cost' && mixed) && bins.some((b) => n(b[metric]));
  useEffect(() => {
    if (!ref.current || !valid) return;
    const muted = dark ? '#aaaab0' : '#73737d',
      line = dark ? '#303034' : '#efeff2',
      color = metric === 'cost' ? '#10b981' : metric === 'requests' ? '#7193c6' : '#ae52e8';
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels: bins.map((b) => b.label),
        datasets: [
          {
            label: {
              tokens: 'Token',
              cost: report.source !== 'account' ? t('估算费用') : t('实际费用'),
              requests: t('记录数'),
            }[metric],
            data: bins.map((b) => b[metric]),
            backgroundColor: color,
            borderRadius: 2,
            maxBarThickness: 42,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (c) => (metric === 'cost' ? money(c.parsed.y, 4, currency) : number(c.parsed.y)) },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: muted,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12,
              font: { family: 'Geist Mono', size: 10 },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: line },
            border: { display: false },
            ticks: {
              color: muted,
              maxTicksLimit: 5,
              callback: (v) => (metric === 'cost' ? money(v, 2, currency) : compact(v)),
              font: { family: 'Geist Mono', size: 10 },
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [bins, metric, dark, valid, report?.source, currency]);
  return (
    <section className="panel analytics-panel trend-panel">
      <Heading caption="USAGE OVER TIME" title={report?.range.id === 'today' ? t('今日消耗节奏') : t('用量趋势')}>
        <div className="chart-metrics" role="group" aria-label={t('趋势指标')}>
          {[
            ['tokens', 'Token'],
            ['cost', t('费用')],
            ['requests', t('记录')],
          ].map(([id, label]) => (
            <button
              key={id}
              className={metric === id ? 'selected' : ''}
              aria-pressed={metric === id}
              onClick={() => setMetric(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </Heading>
      {valid ? (
        <div className="chart-frame">
          <canvas
            ref={ref}
            role="img"
            aria-label={t('{v0} {v1} 趋势，精确数值可在下方展开查看', { v0: t(report.range.label), v1: metric })}
          />
        </div>
      ) : (
        <Empty
          text={
            metric === 'cost' && mixed
              ? t('币种不同，请按模型筛选查看费用趋势')
              : metric === 'cost' && report?.source !== 'account'
                ? t('设置模型单价后可查看估算费用趋势')
                : t('尚无足够记录，采集后会在这里显示趋势')
          }
        />
      )}
      <div className="chart-foot">
        <span>
          {report?.sampled
            ? t('账户采样增量 · 未采集区间留空，不补零')
            : t('按记录时间归组 · 包含失败、取消时已报告的用量')}
        </span>
        <button onClick={() => setTable(!table)} aria-expanded={table}>
          {table ? t('收起数据') : t('查看数据')}
          <DotsThree size={17} />
        </button>
      </div>
      {table && (
        <div className="analysis-table-wrap chart-data">
          <table>
            <thead>
              <tr>
                <th>{t('时间')}</th>
                <th>Token</th>
                <th>
                  {t('费用')}
                  {report.source !== 'account' ? t('（估算）') : ''}
                </th>
                <th>{t('记录')}</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.from}>
                  <td>{b.label}</td>
                  <td>{number(b.tokens)}</td>
                  <td>
                    {b.currency === null && Object.keys(b.costsByCurrency || {}).length > 1
                      ? Object.entries(b.costsByCurrency).map(([unit, entry]) => (
                          <span className="currency-line" key={unit}>
                            {unit} {money(entry.cost, 4, unit)}
                          </span>
                        ))
                      : money(b.cost, 4, b.currency === undefined ? 'USD' : b.currency)}
                  </td>
                  <td>{number(b.requests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report?.sampled && (
        <p className="analysis-note">
          <Disclosure
            summary={t('只统计连续采样的增量，可能小于接口总量')}
            detail={t('跨分组边界、离线和账期切换的间隔不分摊。首次采样：') + stamp(report.historyStart) + t('。')}
          />
        </p>
      )}
    </section>
  );
}
function Prediction({ value: p }) {
  const futureText = (w) => {
    if (w.status === 'at-limit') return t('当前窗口已达上限');
    if (w.status === 'idle') return t('近期未新增消耗');
    if (w.status === 'after-reset') return t('按当前速度，预计重置前不会触顶');
    if (w.status === 'before-reset') {
      const m = Math.ceil(w.minutesToCap);
      return t('约 {v0}后触顶', {
        v0: m >= 60 ? t('{v0} 小时 {v1} 分钟', { v0: Math.floor(m / 60), v1: m % 60 }) : t('{v0} 分钟', { v0: m }),
      });
    }
    return t('该窗口的连续样本不足');
  };
  return (
    <section className="panel analytics-panel forecast-panel">
      <Heading icon={Timer} caption="PACE & FORECAST" title={t('账户消耗速度与预测')} />
      <div className="forecast-rate">
        <div>
          <span>{t('Token / 分钟')}</span>
          <strong className="mono">{compact(p?.tokensPerMinute)}</strong>
        </div>
        <div>
          <span>{t('费用 / 小时')}</span>
          <strong className="mono">{money(p?.costPerHour)}</strong>
        </div>
        <span className="estimate-label">{t('条件估计')}</span>
      </div>
      {p?.available ? (
        <>
          <div className="forecast-windows">
            {p.windows.map((w) => (
              <div
                key={w.key}
                className={w.status === 'before-reset' || w.status === 'at-limit' ? 'forecast-warning' : ''}
              >
                <span>{w.key === 'five' ? t('5 小时窗口') : t('每周窗口')}</span>
                <strong>{futureText(w)}</strong>
                <small>{w.resetAt ? t('重置时间 {v0}', { v0: stamp(w.resetAt) }) : t('等待有效重置时间')}</small>
              </div>
            ))}
          </div>
          <p className="analysis-note">
            <Disclosure
              summary={
                t('按最近 ') +
                Math.round(p.minutes) +
                t(' 分钟的速度推算') +
                (p.purchasedAvailable ? t('；购买额度仍有余额，窗口触顶后可能转用购买额度') : '')
              }
              detail={t('基于账户采样，假设消耗速度保持不变；不随上方时间筛选改变。')}
            />
          </p>
        </>
      ) : (
        <p className="forecast-empty">
          <Info size={16} />
          {t(p?.reason) || t('连接账户后开始积累采样，至少 10 分钟后提供预测。')}
        </p>
      )}
    </section>
  );
}
function Funding({ report }) {
  const c = report?.credits,
    f = report?.summary?.funding;
  return (
    <section className="panel analytics-panel">
      <Heading icon={Coins} caption="CREDIT SOURCES" title={t('额度从哪里扣')} />
      <div className="funding-grid">
        {[
          ['monthly', t('套餐额度'), 'monthly'],
          ['purchased', t('购买额度'), 'purchased'],
          ['free', t('免费额度'), 'free'],
        ].map(([id, label, key]) => (
          <div key={id}>
            <span>{label}</span>
            <strong className="mono">{money(c?.[key])}</strong>
            <small>{t('当前剩余')}</small>
            <div className="funding-spent">
              <span>
                {t(report?.range.label)}
                {t('消耗')}
              </span>
              <b className="mono">{money(f?.[id])}</b>
            </div>
          </div>
        ))}
      </div>
      {n(f?.purchased) && f.purchased > 0 && (
        <div className="analysis-callout">
          <Coins size={17} />
          {t('所选时段已使用')} {money(f.purchased)} {t('购买额度。')}
        </div>
      )}
      <p className="analysis-note">
        <Disclosure
          summary={t('余额是当前值，消耗是所选时段汇总')}
          detail={t('购买额度不受套餐短周期窗口限制；窗口触顶不等于账户完全不可用。缺失的消耗字段显示“—”。')}
        />
      </p>
      <p className="analysis-note">
        {t('余额更新于')} {stamp(report?.creditUpdatedAt)} {t('· 消耗更新于')} {stamp(report?.updatedAt)}
      </p>
    </section>
  );
}
function Cache({ summary: s, reported = false }) {
  const c = s?.cache;
  return (
    <section className="panel analytics-panel">
      <Heading icon={Stack} caption="CACHE INSIGHTS" title={t('缓存利用情况')} />
      <div className="cache-top">
        <div>
          <span>{t('缓存读取命中率')}</span>
          <strong className="mono">{percent(c?.hitRate)}</strong>
          <small>{t('缓存读取 Token / 有缓存字段的输入 Token')}</small>
        </div>
        <div>
          <span>{t('读取缓存估算节省')}</span>
          <strong className="mono">
            {money(c?.estimatedSavings, 4, c?.currency === undefined ? 'USD' : c.currency)}
          </strong>
          <small>
            {t('相较同量普通输入，不含写入溢价')}
            {c?.currency ? ' · ' + c.currency : ''}
          </small>
          {!c?.currency &&
            Object.entries(c?.savingsByCurrency || {}).map(([unit, value]) => (
              <small className="currency-line" key={unit}>
                {unit} {money(value, 4, unit)} {t('· 已知部分')}
              </small>
            ))}
        </div>
      </div>
      <div
        className="cache-bar"
        role="img"
        aria-label={t('普通输入 {v0}，缓存读取 {v1}，缓存写入 {v2}', {
          v0: number(c?.fresh),
          v1: number(c?.read),
          v2: number(c?.write),
        })}
      >
        {c?.input > 0 &&
          [
            ['fresh', 'fresh'],
            ['read', 'read'],
            ['write', 'write'],
          ].map(([key, cls]) => <span key={key} className={cls} style={{ flex: c[key] }} />)}
      </div>
      <div className="cache-legend">
        {[
          ['fresh', t('普通输入')],
          ['read', t('缓存读取')],
          ['write', t('缓存写入')],
        ].map(([key, label]) => (
          <div key={key}>
            <i className={key} />
            <span>{label}</span>
            <strong className="mono">{c?.requests ? compact(c[key]) : '—'}</strong>
          </div>
        ))}
      </div>
      <p className="analysis-note">
        {t('缓存数据覆盖')} {number(c?.requests)} {t('次')}
        {reported ? t('已报告用量的') : t('已完成')}
        {t('请求（')}
        {percent(c?.coverage)}
        {t('）；')}
        <Disclosure
          summary={number(c?.missing) + t(' 次缺少完整缓存字段')}
          detail={t('输入总量包含缓存读写，拆分后不会重复累计。')}
        />
      </p>
      {!c?.requests && (
        <div className="analysis-callout">
          <Info size={17} />
          {t('当前筛选下没有完整缓存数据，不将缺失值当作零命中。')}
        </div>
      )}
    </section>
  );
}

function ToolCoverage({ report, sources }) {
  const coverage = report?.coverage,
    rows = report?.sourceReports || [];
  const byId = new Map(sources.map((item) => [item.id, item]));
  return (
    <details className="tool-coverage">
      <summary>
        <Info size={14} />
        <span>{t('来源与覆盖范围')}</span>
        <small>
          {coverage?.complete ? t('所选范围已覆盖') : coverage?.partial ? t('部分覆盖') : t('覆盖范围待确认')}
        </small>
      </summary>
      <div className="tool-coverage-body">
        <p>
          <Disclosure
            summary={t('Token 为已报告用量，费用为本机估算')}
            detail={t('包含失败、取消请求中明确返回的数值。费用按本机模型单价计算，缺失字段保持未知。')}
          />
        </p>
        {coverage?.reason && <p>{t(coverage.reason)}</p>}
        {rows.length > 0 && (
          <ul>
            {rows.map((row) => {
              const source = byId.get(row.id);
              const start = row.associationCoverage
                  ? row.associationCoverage.start
                  : (row.coverage?.start ?? row.observedStartAt),
                end = row.associationCoverage ? row.associationCoverage.end : (row.coverage?.end ?? row.observedEndAt);
              return (
                <li key={row.id}>
                  <strong>
                    {source?.label || row.label || (source?.kind === 'harness' ? 'DeepSeek Harness' : t('工具数据源'))}
                  </strong>
                  <span>{start && end ? `${stamp(start)} — ${stamp(end)}` : t('尚无可确认的时间范围')}</span>
                  <small>
                    <Disclosure
                      summary={
                        (row.status === 'ready'
                          ? t(row.message) || t('同步成功')
                          : row.status === 'partial'
                            ? t('部分数据')
                            : t(row.message) || t('等待可用数据')) +
                        (row.truncated ? t(' · 已达到读取上限') : '') +
                        (row.coverage?.complete ? t(' · 完整覆盖') : t(' · 不保证覆盖全部请求'))
                      }
                      detail={row.status === 'ready' || row.status === 'stale' ? t(row.messageDetail) : null}
                    />
                  </small>
                </li>
              );
            })}
          </ul>
        )}
        <p>
          {t('会话按数据源隔离。仅按已确认的规则关联；切换总览账户不会改变记录归属。已关联')}{' '}
          {number(report?.association?.linkedRecords)} {t('条，未关联或待确认')}{' '}
          {number(report?.association?.unlinkedRecords)} {t('条。')}
          {report?.association?.issues?.map((issue) => (
            <span key={issue.id} className="amber-text">
              {' '}
              {t(issue.message)}
            </span>
          ))}
          {t(report?.association?.configurationIssue)}
          {report?.summary?.missingUsageRequests > 0
            ? t('{v0} 次请求未报告用量，不计为零 Token。', { v0: number(report.summary.missingUsageRequests) })
            : ''}
        </p>
      </div>
    </details>
  );
}

export function AnalyticsPage({
  report,
  loading,
  error,
  source,
  onSource,
  range,
  onRange,
  filters,
  onFilters,
  refresh,
  cancel,
  chooseDatabase,
  savePrice,
  dark,
  billingAvailable,
  quotaOnly = false,
  balanceOnly = false,
  toolSources = [],
  sourceIds = [],
  onSourceIds,
  onManageSources,
  billingGroups = [],
  billingGroupId = '',
  onBillingGroupId,
  onExport = null,
}) {
  const [tab, setTab] = useState('trend'),
    [sort, setSort] = useState('tokens'),
    [group, setGroup] = useState('projects'),
    [priceModel, setPriceModel] = useState(null),
    [priceForm, setPriceForm] = useState({ input: '', output: '', read: '', write: '' }),
    [priceCurrency, setPriceCurrency] = useState('USD'),
    [priceError, setPriceError] = useState(''),
    [saving, setSaving] = useState(false);
  const dialog = useRef();
  const local = source === 'local' || source === 'tools',
    s = report?.summary;
  const manageSources = onManageSources || chooseDatabase;
  const currency = s?.currency === undefined ? 'USD' : s.currency;
  const enabledSources = toolSources.filter((item) => item.enabled !== false);
  const selectedIds = sourceIds.length ? sourceIds : enabledSources.map((item) => item.id);
  const costParts = Object.entries(s?.costsByCurrency || {});
  if (local && tab === 'funding') setTab('trend');
  useEffect(() => {
    if (local && range === 'billing' && !billingAvailable) onRange('today');
  }, [local, range, onRange, billingAvailable]);
  function toggleSource(id) {
    const next = selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id];
    if (next.length) {
      onSourceIds?.(next);
      clearFilters();
    }
  }
  const totalNote = local
    ? s?.missingTokenRequests
      ? t('{v0} 已知 Token · {v1} 次缺少完整用量', { v0: number(s.knownTokens), v1: number(s.missingTokenRequests) })
      : report?.comparison?.available === false
        ? t(report.comparison.reason) || t('暂无完整的可比时间范围')
        : change(s?.total, report?.previous?.total)
    : t('{v0} · 输入与输出汇总', { v0: t(report?.range?.label || '') });
  const costNote = local
    ? currency === null
      ? costParts.map(([unit, entry]) => `${unit} ${money(entry.knownCost, 4, unit)}`).join(' · ') ||
        t('尚无可估算费用，请设置模型单价')
      : t('{v0} 估算 · {v1}', {
          v0: currency,
          v1: s?.unpricedRequests ? number(s.unpricedRequests) + t(' 次未定价，显示已定价部分') : t('不代表实际账单'),
        })
    : t('{v0} · 接口实际费用', { v0: t(report?.range?.label || '') });
  useEffect(() => {
    if (priceModel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [priceModel]);
  const sorted = (rows) =>
    [...(rows || [])].sort((a, b) =>
      sort === 'requests'
        ? b.requests - a.requests
        : sort === 'cost'
          ? String(a.currency || '').localeCompare(String(b.currency || '')) || (b.cost ?? -1) - (a.cost ?? -1)
          : b.knownTokens - a.knownTokens,
    );
  function openPrice(row) {
    setPriceModel(row);
    setPriceError('');
    const p = report.prices?.[row.id];
    setPriceCurrency(p?.currency || 'USD');
    setPriceForm(
      Object.fromEntries(['input', 'output', 'read', 'write'].map((k) => [k, p && n(p[k]) ? String(p[k]) : ''])),
    );
  }
  async function submitPrice(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const price = {
        ...Object.fromEntries(Object.entries(priceForm).map(([k, v]) => [k, Number(v)])),
        currency: priceCurrency,
      };
      const result = await savePrice({ key: priceModel.id, price });
      if (result) {
        setPriceModel(null);
        refresh();
      } else setPriceError(t('未能保存，请检查单价后重试。'));
    } finally {
      setSaving(false);
    }
  }
  const clearFilters = () => onFilters({ model: '', project: '', session: '' });
  const selectLocal = () => {
    onSource('tools');
    if (range === 'billing') onRange('today');
    clearFilters();
  };
  return (
    <div className="analytics-page">
      <div className="analytics-toolbar">
        <div className="source-switch" role="group" aria-label={t('分析数据来源')}>
          <button
            className={!local ? 'selected' : ''}
            aria-pressed={!local}
            onClick={() => {
              onSource('account');
              clearFilters();
            }}
          >
            {t('账户统计')}
          </button>
          <button className={local ? 'selected' : ''} aria-pressed={local} onClick={selectLocal}>
            <Database size={14} />
            {t('工具分析')}
          </button>
        </div>
        <RangeControl
          value={range}
          onChange={onRange}
          billingAvailable={billingAvailable}
          billingUnavailableReason={local ? t('请选择具有有效账期的已确认计费账户') : t('连接账户以确认账期')}
        />
        <button className="button analysis-refresh" disabled={loading} onClick={refresh}>
          <ArrowClockwise className={loading ? 'spin' : ''} size={14} />
          {loading ? t('更新中') : t('刷新分析')}
        </button>
        {source === 'tools' && onExport && s && !loading && (
          // T13.4: the records behind this view (same range, sources and filters) as a CSV file.
          <button className="button analysis-export" type="button" onClick={onExport}>
            <FileArrowDown size={14} />
            {t('导出 CSV')}
          </button>
        )}
        {local && loading && cancel && (
          <button className="button analysis-cancel" type="button" onClick={cancel}>
            <X size={14} />
            {t('取消分析')}
          </button>
        )}
      </div>
      <div className="analysis-scope">
        <span>
          <span className="status-dot" />
          {local
            ? t('本机工具用量 · 已报告用量口径')
            : quotaOnly
              ? balanceOnly
                ? t('当前按量连接')
                : t('当前套餐连接')
              : t('Command Code 账户 / 组织汇总')}
          <span className="scope-tag">
            {local
              ? t('与账户总量独立')
              : quotaOnly
                ? balanceOnly
                  ? t('仅提供余额')
                  : t('仅提供额度')
                : t('实际费用')}
          </span>
        </span>
        <span>
          {report?.updatedAt
            ? t('更新于 {v0}', { v0: stamp(report.updatedAt) })
            : !local && quotaOnly
              ? t('统计未提供')
              : t('等待数据')}
        </span>
      </div>
      {local && (
        <fieldset className="analysis-source-picker">
          <legend>{t('工具数据源')}</legend>
          <div>
            <button
              type="button"
              className={!sourceIds.length ? 'selected' : ''}
              aria-pressed={!sourceIds.length}
              disabled={!enabledSources.length}
              onClick={() => {
                onSourceIds?.([]);
                clearFilters();
              }}
            >
              {t('全部已启用')}
            </button>
            {enabledSources.map((item) => (
              <label
                key={item.id}
                title={selectedIds.length === 1 && selectedIds.includes(item.id) ? t('至少保留一个数据源') : item.label}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  disabled={selectedIds.length === 1 && selectedIds.includes(item.id)}
                  onChange={() => toggleSource(item.id)}
                />
                <span>{item.label}</span>
                <small>
                  {{
                    opencode: 'OpenCode',
                    harness: 'Harness',
                    zcode: 'Zcode',
                    codex: 'Codex',
                    'claude-code': 'Claude Code',
                    'claude-code-logs': t('Claude Code 会话日志'),
                    'gemini-cli': 'Gemini CLI',
                    'kimi-code-cli': 'Kimi Code',
                    'qwen-code': 'Qwen Code',
                    cline: 'Cline',
                    kilo: 'Kilo Code',
                    goose: 'Goose',
                    crush: 'Crush',
                  }[item.kind] || item.kind}
                </small>
              </label>
            ))}
            {!enabledSources.length && <span className="source-picker-empty">{t('暂无启用的数据源')}</span>}
          </div>
        </fieldset>
      )}
      {local && (
        <div className="analysis-filters">
          <SlidersHorizontal size={15} />
          <Select
            label={t('工具计费账户')}
            value={billingGroupId}
            onChange={onBillingGroupId}
            menuWidth={280}
            options={[
              { value: '', label: t('全部记录（独立统计）') },
              { value: 'unlinked', label: t('未关联 / 待确认记录') },
              ...billingGroups
                .filter((g) => g.valid)
                .map((g) => ({ value: g.id, label: g.label, description: t('人工确认的关联范围') })),
            ]}
          />
          <Select
            label={t('筛选模型')}
            value={filters.model || ''}
            onChange={(value) => onFilters({ ...filters, model: value, session: '' })}
            menuWidth={330}
            options={[
              { value: '', label: t('全部模型') },
              ...(report?.options?.models || []).map((m) => ({
                value: m.id,
                label: m.name,
                description: m.provider === 'unknown' ? t('来源未标记') : m.provider,
              })),
            ]}
          />
          <Select
            label={t('筛选项目')}
            value={filters.project || ''}
            onChange={(value) => onFilters({ ...filters, project: value, session: '' })}
            menuWidth={330}
            options={[
              { value: '', label: t('全部项目') },
              ...(report?.options?.projects || []).map((p) => ({ value: p, label: projectName(p), description: p })),
            ]}
          />
          {filters.session && (
            <span className="filter-pill">
              {t('会话')} {sessionName(filters.session)}
              <button aria-label={t('清除会话筛选')} onClick={() => onFilters({ ...filters, session: '' })}>
                <X size={13} />
              </button>
            </span>
          )}
          {Object.values(filters).some(Boolean) && (
            <button className="text-button" onClick={clearFilters}>
              {t('清除筛选')}
            </button>
          )}
          <button className="text-button choose-database" onClick={manageSources}>
            {t('管理数据源')}
            <Folder size={14} />
          </button>
        </div>
      )}
      {(error || report?.message || report?.truncated) && (
        <div className="analysis-callout" role="status">
          <WarningCircle size={17} />
          {t(error) || (
            <span>
              <Disclosure
                summary={t(report.message) || t('记录超过单次读取上限，仅统计最近 100,000 条；请缩小时间范围。')}
                detail={report.message ? t(report.messageDetail) : null}
              />
            </span>
          )}
        </div>
      )}
      {local && report?.sourceReports?.some((row) => row.kind === 'codex') && (
        <div className="analysis-callout">
          <Info size={17} />
          <span>
            {t(
              '包含 Codex 已报告用量快照：记录数不等于请求次数。Codex 缺少请求终态，不参与成功率和已完成请求均值；缓存与推理子项不重复累加。',
            )}
          </span>
        </div>
      )}
      {local && report?.sourceReports?.some((row) => ['goose', 'crush'].includes(row.kind)) && (
        // T13.2 (D20): Goose and Crush keep only each session's total.
        <div className="analysis-callout">
          <Info size={17} />
          <span>
            {t(
              '包含 Goose / Crush 会话级汇总：每条是一个会话的累计用量，不是请求数；跨天的会话整段算在最后更新的那天，按日分布会有偏差。',
            )}
          </span>
        </div>
      )}
      {local && report && <ToolCoverage report={report} sources={toolSources} />}
      {!report && loading ? (
        <div className="analysis-loading">
          <ArrowClockwise className="spin" size={21} />
          {t('正在整理用量数据…')}
        </div>
      ) : !s ? (
        <Empty
          text={report?.message || t('当前没有可用统计')}
          action={local ? manageSources : selectLocal}
          label={local ? t('管理工具数据源') : t('查看工具分析')}
        />
      ) : (
        <>
          <div className="analysis-stats">
            <Stat label={local ? 'REPORTED TOKENS' : 'TOTAL TOKENS'} value={compact(s.total)} note={totalNote} />
            <Stat
              icon={Coins}
              label={local ? 'ESTIMATED COST' : 'TOTAL COST'}
              value={
                local && currency === null && costParts.length > 1
                  ? t('分币种')
                  : n(s.cost)
                    ? money(s.cost, 2, currency)
                    : local && s.pricedRequests
                      ? money(s.knownCost, 2, currency)
                      : '—'
              }
              note={costNote}
            />
            <Stat
              icon={Pulse}
              label={local ? 'USAGE RECORDS' : 'REQUESTS'}
              value={compact(s.requests)}
              note={
                local
                  ? t('{v0} 次已报告用量 · {v1} 已完成', { v0: number(s.reportedRequests), v1: number(s.completed) })
                  : t('{v0} 已完成', { v0: number(s.completed) })
              }
            />
            <Stat
              icon={Stack}
              label={local ? 'CACHE HIT RATE' : 'SUCCESS RATE'}
              value={percent(local ? s.cache?.hitRate : s.successRate)}
              note={
                local
                  ? t('{v0} 条记录有缓存字段', { v0: number(s.cache?.requests) })
                  : t('{v0} 次失败 · 按接口计数', { v0: number(s.failed) })
              }
            />
          </div>
          <nav className="analysis-tabs" aria-label={t('分析内容')}>
            {[
              ['trend', t('趋势概览')],
              ['models', t('模型排行')],
              ['projects', t('项目与会话')],
              ['cache', t('缓存分析')],
              ...(!local ? [['funding', t('额度与预测')]] : []),
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === 'trend' && (
            <>
              <div className="analytics-grid">
                <Trend report={report} dark={dark} />
                <Health s={s} local={local} />
              </div>
              {!local ? (
                <Prediction value={report.prediction} />
              ) : (
                <div className="analysis-bottom-note">
                  <ChartLineUp size={16} />
                  <span>{t('沿用上方时间、模型和项目筛选，可继续查看排行及缓存构成。')}</span>
                  <button onClick={() => setTab('models')}>
                    {t('查看模型排行')}
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
          {tab === 'models' &&
            (!local ? (
              <Empty text={t('账户汇总暂不提供模型明细')} action={selectLocal} />
            ) : (
              <section className="panel analytics-panel">
                <Heading icon={Lightning} caption="MODEL BREAKDOWN" title={t('模型用量排行')}>
                  <Select
                    label={t('模型排行排序')}
                    value={sort}
                    onChange={setSort}
                    menuWidth={170}
                    options={[
                      { value: 'tokens', label: t('按 Token 排序') },
                      { value: 'requests', label: t('按记录数排序') },
                      { value: 'cost', label: t('按币种及估算费用排序') },
                    ]}
                  />
                </Heading>
                <div className="analysis-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('模型 / 来源')}</th>
                        <th>{t('记录')}</th>
                        <th>Token</th>
                        <th>{t('已知 Token 占比')}</th>
                        <th>{t('估算费用 · 币种')}</th>
                        <th>{t('单价')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted(report.models).map((row) => (
                        <tr key={row.id}>
                          <td>
                            <button
                              className="table-link"
                              onClick={() => {
                                onFilters({ ...filters, model: row.id });
                                setTab('trend');
                              }}
                            >
                              {row.model}
                              <ArrowUpRight size={12} />
                            </button>
                            <small className="provider-label" title={row.provider}>
                              {row.provider === 'unknown' ? t('来源未标记') : row.provider}
                            </small>
                          </td>
                          <td className="mono">{number(row.requests)}</td>
                          <td className="mono">{compact(row.total)}</td>
                          <td>
                            <div className="table-share">
                              <i style={{ width: `${s.knownTokens ? (row.knownTokens / s.knownTokens) * 100 : 0}%` }} />
                            </div>
                            <small>{s.knownTokens ? percent((row.knownTokens / s.knownTokens) * 100) : '—'}</small>
                          </td>
                          <td className="mono">
                            {money(row.cost, 4, row.currency === undefined ? 'USD' : row.currency)}
                            {row.currency && <small className="unpriced">{row.currency}</small>}
                            {row.unpricedRequests > 0 && (
                              <small className="unpriced">
                                {row.unpricedRequests} {t('次未定价')}
                              </small>
                            )}
                          </td>
                          <td>
                            <button className="text-button" onClick={() => openPrice(row)}>
                              {report.prices?.[row.id] ? t('编辑') : t('设置单价')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!report.models?.length && <Empty text={t('这个时间范围没有模型记录')} />}
                <p className="analysis-note">
                  <Disclosure
                    summary={t('费用按单价估算，币种之间不相加')}
                    detail={t(
                      '不同供应商的同名模型单独计价，币种之间不换算。未定价或缺少完整 Token 分类的请求不会记为免费。',
                    )}
                  />
                </p>
              </section>
            ))}
          {tab === 'projects' &&
            (!local ? (
              <Empty text={t('项目与会话来自本机工具记录')} action={selectLocal} />
            ) : (
              <section className="panel analytics-panel">
                <Heading
                  icon={group === 'projects' ? Folder : ChatCircle}
                  caption="WORK BREAKDOWN"
                  title={t('消耗用在了哪里')}
                >
                  <div className="chart-metrics">
                    {[
                      ['projects', t('项目')],
                      ['sessions', t('会话')],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={group === id ? 'selected' : ''}
                        aria-pressed={group === id}
                        onClick={() => setGroup(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Heading>
                <div className="analysis-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{group === 'projects' ? t('项目') : t('会话')}</th>
                        <th>{t('记录')}</th>
                        <th>Token</th>
                        <th>{t('估算费用 · 币种')}</th>
                        <th>{t('最近使用')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report[group] || []).map((row) => (
                        <tr key={row.id}>
                          <td>
                            <button
                              className="table-link"
                              title={row.id}
                              onClick={() => {
                                onFilters({ ...filters, [group === 'projects' ? 'project' : 'session']: row.id });
                                if (group === 'projects') setGroup('sessions');
                                else setTab('trend');
                              }}
                            >
                              {group === 'projects'
                                ? projectName(row.id)
                                : t('会话 {v0}', { v0: sessionName(row.sessionId || row.id) })}
                              <ArrowUpRight size={12} />
                            </button>
                            <small className="provider-label" title={row.project}>
                              {group === 'projects' ? row.id : projectName(row.project)}
                            </small>
                          </td>
                          <td className="mono">{number(row.requests)}</td>
                          <td className="mono">{compact(row.total)}</td>
                          <td className="mono">
                            {money(row.cost, 4, row.currency === undefined ? 'USD' : row.currency)}
                            {row.currency && <small className="unpriced">{row.currency}</small>}
                          </td>
                          <td className="mono muted">{stamp(row.last)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!report[group]?.length && <Empty text={t('当前筛选下没有记录')} />}
                <p className="analysis-note">
                  <Disclosure
                    summary={t('点击项目看会话，点击会话看趋势')}
                    detail={t('只读取用量计数与项目目录，不读取对话正文。')}
                  />
                </p>
              </section>
            ))}
          {tab === 'cache' &&
            (!local ? (
              <Empty text={t('账户接口暂不提供缓存分类')} action={selectLocal} />
            ) : (
              <Cache summary={s} reported={local} />
            ))}
          {tab === 'funding' &&
            (local ? (
              <Empty
                text={t('额度扣费与触顶预测基于账户数据')}
                action={() => {
                  onSource('account');
                  clearFilters();
                }}
                label={t('查看账户额度')}
              />
            ) : (
              <>
                <Funding report={report} />
                <Prediction value={report.prediction} />
              </>
            ))}
        </>
      )}
      <div className="analysis-footnote">
        <Database size={13} />
        <span>
          {local
            ? t('数据留在本机 · 工具用量、估算费用与平台额度、实际账单分别展示，不能相加')
            : quotaOnly
              ? balanceOnly
                ? t('账户余额请在总览查看 · 余额变化不作为实际消费')
                : t('套餐额度请在总览查看 · 不根据额度比例推算 Token 或费用')
              : t('历史趋势从助手开始采样时累计 · API 汇总与采样图的覆盖范围可能不同')}
        </span>
      </div>
      <dialog
        ref={dialog}
        className="info-dialog price-dialog"
        onClose={() => setPriceModel(null)}
        aria-labelledby="price-title"
      >
        <div className="dialog-title">
          <h2 id="price-title">{t('设置估算单价')}</h2>
          <button aria-label={t('关闭单价设置')} className="icon-button" onClick={() => setPriceModel(null)}>
            <X size={17} />
          </button>
        </div>
        <form onSubmit={submitPrice}>
          <p>{priceModel?.model}</p>
          <small>{t('所选币种 / 百万 Token · 仅用于本机估算，不修改供应商价格。')}</small>
          <fieldset className="price-currency">
            <legend>{t('单价币种')}</legend>
            {[
              ['USD', t('USD · 美元')],
              ['CNY', t('CNY · 人民币')],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="price-currency"
                  value={value}
                  checked={priceCurrency === value}
                  onChange={() => setPriceCurrency(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="price-inputs">
            {[
              ['input', t('普通输入')],
              ['output', t('输出')],
              ['read', t('缓存读取')],
              ['write', t('缓存写入')],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000"
                  step="any"
                  aria-label={t('{v0}单价', { v0: label })}
                  value={priceForm[key]}
                  onChange={(e) => setPriceForm({ ...priceForm, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          {priceError && <p className="form-error">{priceError}</p>}
          <button className="button primary" disabled={saving} type="submit">
            {saving ? t('保存中') : t('保存估算单价')}
          </button>
        </form>
      </dialog>
    </div>
  );
}
