// T10.2 D10 mock (not shipped): two layouts for the OpenRouter key card, built from the app's own styles and Bar so
// the screenshots match the real UI. Sample data only. ?layout=a|b&theme=dark
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldCheck, Coins, Clock, Info, Receipt } from '@phosphor-icons/react';
import { Bar } from '../../../src/ProviderViews.jsx';
import { Disclosure } from '../../../src/Disclosure.jsx';
import '../../../src/styles.css';
import '../../../src/desktop.css';
import '../../../src/providers.css';
import '../../../src/balance.css';
import './mock.css';

const q = new URLSearchParams(location.search);
const layout = q.get('layout') === 'b' ? 'b' : 'a';
const dark = q.get('theme') === 'dark';
const usd = (v) => (v === null ? '—' : v.toFixed(2));

// Sample values in the shape of GET /api/v1/key (USD): a monthly key limit, reported spend, two budgets.
const key = { limit: 50, remaining: 31.42, reset: '每月', resetAt: '11月1日 08:00（UTC 0 点）' };
const spend = [
  ['今日', 1.24, 'UTC 当天'],
  ['本周', 9.87, 'UTC 周一起'],
  ['本月', 18.58, 'UTC 当月'],
  ['累计', 128.6, '这把 Key 创建以来'],
];
const budgets = [
  { name: '预算 1', limit: 40, spent: 18.58, reset: '每月' },
  { name: '预算 2', limit: 20, spent: 16.9, reset: '每周' },
];
const pct = (rem, lim) => (rem / lim) * 100;
const tone = (p) => (p < 20 ? 'amber' : 'green');

function AccountLine() {
  return (
    <div className="account-line">
      <span>
        <span className="status-dot green" />
        OpenRouter · 示例 · Key 用量与上限 <span className="mock-badge">样例验证</span>
      </span>
      <span>这把 Key</span>
    </div>
  );
}

function Footer() {
  return (
    <>
      <p className="analysis-note">查询时间：2026/10/28 15:20:05</p>
      <div className="quota-footer">
        <Info size={14} />
        <span>
          <Disclosure
            summary="上限和花费都只针对这把 Key"
            detail="OpenRouter 返回的是这把 Key 的花费上限与已报告花费（USD），不是账户余额，也不是账单；同一账户的其他 Key 不在内，各连接不相加。"
          />
        </span>
      </div>
    </>
  );
}

function QuotaRow({ group, label, remaining, limit, reset, resetAt }) {
  const unlimited = limit === null,
    p = unlimited ? null : pct(remaining, limit);
  return (
    <section className="quota-row">
      <div className="quota-top">
        <div>
          <div className="micro-label provider-group">{group}</div>
          <h2>{label}</h2>
        </div>
        <div className={'quota-number ' + (unlimited ? 'green' : tone(p)) + '-text'}>
          <strong>{unlimited ? '不限' : p.toFixed(1) + '%'}</strong>
          <span className="remaining-label">{unlimited ? '上限' : '剩余'}</span>
        </div>
      </div>
      <Bar value={p} label={group + label} tone={unlimited ? 'green' : tone(p)} />
      <div className="quota-meta">
        <span>
          {unlimited
            ? '这把 Key 未设花费上限'
            : `剩余 ${usd(remaining)} / 上限 ${usd(limit)} USD`}
        </span>
        <span>
          <Clock size={13} />
          <b className="mono">{reset ? `${reset}重置 · ${resetAt}` : '不重置'}</b>
        </span>
      </div>
    </section>
  );
}

function LayoutA({ unlimited }) {
  return (
    <>
      <section className="panel provider-quota-panel">
        <div className="panel-heading">
          <div className="section-title green-text">
            <ShieldCheck size={16} />
            <span>
              KEY LIMITS <span className="label-cn">/ Key 上限与预算</span>
            </span>
          </div>
          <span className="status-tag green">{unlimited ? '未设上限' : '额度充足'}</span>
        </div>
        <div className="quota-subhead">
          <span>这把 Key 的上限 · 不是账户余额 · {unlimited ? '没有预算' : budgets.length + ' 个预算'}</span>
        </div>
        <div className="provider-quota-grid">
          {unlimited ? (
            <QuotaRow group="KEY · USD" label="花费上限" remaining={null} limit={null} />
          ) : (
            <>
              <QuotaRow group="KEY · USD" label="花费上限" {...key} />
              {budgets.map((b) => (
                <QuotaRow
                  key={b.name}
                  group="BUDGET · USD"
                  label={b.name}
                  remaining={b.limit - b.spent}
                  limit={b.limit}
                  reset={b.reset}
                  resetAt={b.reset === '每周' ? '11月2日 08:00（UTC 周一 0 点）' : key.resetAt}
                />
              ))}
            </>
          )}
        </div>
        {!unlimited && <Footer />}
      </section>
      {!unlimited && <SpendPanel />}
    </>
  );
}

function SpendPanel() {
  return (
    <section className="panel mock-spend-panel">
      <div className="panel-heading">
        <div className="section-title purple-text">
          <Receipt size={16} />
          <span>
            REPORTED SPEND <span className="label-cn">/ 已报告花费</span>
          </span>
        </div>
        <span className="micro-label">USD · 不是账单</span>
      </div>
      <div className="mock-spend-grid">
        {spend.map(([label, v, note]) => (
          <section key={label}>
            <div className="micro-label">{note}</div>
            <h2>{label}</h2>
            <strong className="mono">
              {usd(v)} <small>USD</small>
            </strong>
          </section>
        ))}
      </div>
    </section>
  );
}

function LayoutB({ unlimited }) {
  const used = 18.58;
  return (
    <section className="panel balance-panel">
      <div className="panel-heading">
        <div className="section-title green-text">
          <Coins size={16} />
          <span>
            KEY CREDITS <span className="label-cn">/ Key 可用额度</span>
          </span>
        </div>
        <span className="status-tag green">{unlimited ? '未设上限' : '额度充足'}</span>
      </div>
      <p className="balance-availability">官方返回：这把 Key 的上限与已报告花费 · 不是账户余额 · USD</p>
      <div className="balance-grid">
        <section className="balance-currency" aria-label="Key 剩余可用">
          <div className="micro-label">USD / 美元 · {unlimited ? '不重置' : key.reset + '重置'}</div>
          <h2>{unlimited ? '花费上限' : '本期剩余可用'}</h2>
          <strong className="balance-total mono">
            {unlimited ? '不限' : usd(key.remaining)} {!unlimited && <small>USD</small>}
          </strong>
          <dl>
            <div>
              <dt>花费上限</dt>
              <dd className="mono">{unlimited ? '不限' : usd(key.limit) + ' USD'}</dd>
            </div>
            <div>
              <dt>本期已用</dt>
              <dd className="mono">{usd(used)} USD</dd>
            </div>
            <div>
              <dt>下次重置</dt>
              <dd className="mono">{unlimited ? '—' : key.resetAt}</dd>
            </div>
          </dl>
        </section>
        <section className="balance-currency" aria-label="已报告花费">
          <div className="micro-label">已报告花费 · USD · UTC</div>
          <h2>按周期</h2>
          <dl className="mock-tight">
            {spend.map(([label, v, note]) => (
              <div key={label}>
                <dt>
                  {label} <small className="mock-note">{note}</small>
                </dt>
                <dd className="mono">{usd(v)} USD</dd>
              </div>
            ))}
          </dl>
          <p>花费是 OpenRouter 报告的这把 Key 的用量，不是账单。</p>
        </section>
      </div>
      {!unlimited && (
        <table className="mock-budgets">
          <thead>
            <tr>
              <th>预算</th>
              <th>上限</th>
              <th>已用</th>
              <th>剩余</th>
              <th>重置</th>
            </tr>
          </thead>
          <tbody>
            {budgets.map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td className="mono">{usd(b.limit)}</td>
                <td className="mono">{usd(b.spent)}</td>
                <td className={'mono ' + tone(pct(b.limit - b.spent, b.limit)) + '-text'}>{usd(b.limit - b.spent)}</td>
                <td>{b.reset}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Footer />
    </section>
  );
}

function Mock() {
  const L = layout === 'a' ? LayoutA : LayoutB;
  return (
    <div className={'app ' + (dark ? 'dark' : '')}>
      <main className="mock-main">
        <div className="mock-caption micro-label">
          T10.2 设计稿 · 方案 {layout.toUpperCase()}（{layout === 'a' ? '额度窗口式' : '余额卡片式'}）· 示例数据
        </div>
        <AccountLine />
        <div className="provider-dashboard balance-dashboard">
          <L />
        </div>
        <div className="mock-caption micro-label">同一方案 · 这把 Key 未设上限、没有预算时</div>
        <div className="provider-dashboard balance-dashboard">
          <L unlimited />
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Mock />);
