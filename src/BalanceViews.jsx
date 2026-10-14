import React from 'react';
import { Coins, Info, WarningCircle, ArrowUpRight } from '@phosphor-icons/react';
import { formatAmount } from './generated/balance-domain.js';
import { quotaStatus } from './generated/domain.js';
import './balance.css';
const currencyName = (code) => (code === 'CNY' ? '人民币' : '美元');
export function BalanceDashboard({ state, onSettings, onTools }) {
  const { data } = state,
    balance = data.parts.balance,
    rows = balance?.balances || [],
    stale = data.status !== 'connected',
    account = state.accounts?.find((a) => a.id === state.activeAccountId),
    [status, tone] = quotaStatus(state);
  return (
    <div className="balance-dashboard">
      <div className="account-line">
        <span>
          <span className={'status-dot ' + tone} />
          {account?.label || 'DeepSeek'} · 官方按量账户
        </span>
        <span>账户余额</span>
      </div>
      {(data.errors.length > 0 || state.credentialIssue) && (
        <div className="inline-warning" role="status">
          <WarningCircle size={17} />
          <span>
            {state.credentialIssue || data.errors[0].message}
            {balance ? ' 当前显示上次成功的余额，不能代表实时金额。' : ''}
          </span>
          {data.status === 'auth-error' && (
            <button onClick={onSettings}>
              重新连接
              <ArrowUpRight size={14} />
            </button>
          )}
        </div>
      )}
      <section className="panel balance-panel">
        <div className="panel-heading">
          <div className="section-title green-text">
            <Coins size={16} />
            <span>
              ACCOUNT BALANCE <span className="label-cn">/ 账户余额</span>
            </span>
          </div>
          <span className={'status-tag ' + tone}>{status}</span>
        </div>
        <p className="balance-availability">
          {balance
            ? `${stale ? '上次返回' : '官方返回'}：${balance.isAvailable ? '有可供 API 调用的余额' : '当前余额不可用于 API 调用'}`
            : '连接后查询官方账户余额'}{' '}
          · 各币种分别显示
        </p>
        <div className="balance-grid">
          {rows.map((row) => (
            <section className="balance-currency" key={row.currency} aria-label={row.currency + ' 余额'}>
              <div className="micro-label">
                {row.currency} / {currencyName(row.currency)}
              </div>
              <h2>{stale ? '上次可用余额' : '总可用余额'}</h2>
              <strong className="balance-total mono">
                {formatAmount(row.total)} <small>{row.currency}</small>
              </strong>
              <dl>
                <div>
                  <dt>赠金余额</dt>
                  <dd className="mono">
                    {formatAmount(row.granted)} <small>{row.currency}</small>
                  </dd>
                </div>
                <div>
                  <dt>充值余额</dt>
                  <dd className="mono">
                    {formatAmount(row.toppedUp)} <small>{row.currency}</small>
                  </dd>
                </div>
              </dl>
              <p>总余额包含赠金与充值余额，三项不重复相加。</p>
            </section>
          ))}
        </div>
        {!rows.length && (
          <div className="provider-empty">
            {data.fetching
              ? '正在查询余额…'
              : balance
                ? '官方尚未返回币种余额条目，金额保持未知。'
                : '暂无可展示的余额，请先连接账户。'}
          </div>
        )}
        <p className="analysis-note">
          余额查询时间：
          {data.updatedAt.balance ? new Date(data.updatedAt.balance).toLocaleString('zh-CN') : '尚未成功查询'}
          {stale && balance ? ' · 上次数据' : ''}
        </p>
        <div className="quota-footer">
          <Info size={14} />
          <span>余额变化可能包含充值和赠金，不作为实际消费或账单。缺失金额显示“—”，不默认换汇。</span>
        </div>
      </section>
      <section className="panel balance-tools">
        <div>
          <h2>工具 Token 与估算费用</h2>
          <p>
            本机工具数据独立统计，可按人工确认的计费账户关联范围查看。费用来自已配置的模型单价估算，不是 DeepSeek
            官方账单。
          </p>
        </div>
        <button className="button" onClick={onTools}>
          查看工具分析
          <ArrowUpRight size={14} />
        </button>
      </section>
      <div className="provider-data-note">
        <Info size={16} />
        <p>
          当前接入仅查询余额，不提供完整历史账单、Token 汇总或套餐额度百分比。同一账户的不同 Key
          可能共享余额，各连接不相加。
        </p>
      </div>
    </div>
  );
}
export function BalanceWidget({ state }) {
  const balance = state.data.parts.balance,
    account = state.accounts?.find((a) => a.id === state.activeAccountId),
    [status] = quotaStatus(state),
    stale = state.data.status !== 'connected';
  return (
    <div className="balance-widget">
      <div className="provider-widget-account">
        <strong>{account?.label || 'DeepSeek · 官方按量'}</strong>
        <small>
          {status}
          {stale && balance ? ' · 上次余额' : ''}
        </small>
      </div>
      {balance?.balances.map((row) => (
        <section className="balance-widget-currency" key={row.currency}>
          <div className="widget-row">
            <span>
              {row.currency} {currencyName(row.currency)}
            </span>
            <strong className="mono">{formatAmount(row.total)}</strong>
          </div>
          {state.settings.widgetExpanded && (
            <dl>
              <div>
                <dt>赠金</dt>
                <dd>
                  {formatAmount(row.granted)} {row.currency}
                </dd>
              </div>
              <div>
                <dt>充值</dt>
                <dd>
                  {formatAmount(row.toppedUp)} {row.currency}
                </dd>
              </div>
            </dl>
          )}
        </section>
      ))}
      {!balance?.balances.length && <p className="provider-empty">余额金额暂未返回</p>}
      <small className="widget-synced">
        不同币种分别显示 · 余额不等于消费
        {state.settings.widgetExpanded && (
          <>
            <br />
            查询时间：
            {state.data.updatedAt.balance
              ? new Date(state.data.updatedAt.balance).toLocaleTimeString('zh-CN')
              : '尚未查询'}
          </>
        )}
      </small>
    </div>
  );
}
