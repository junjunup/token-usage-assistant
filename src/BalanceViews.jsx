import React from 'react';
import { ProviderStatusLine } from './ProviderStatus.jsx';
import { Disclosure } from './Disclosure.jsx';
import { Coins, Info, WarningCircle, ArrowUpRight } from '@phosphor-icons/react';
import { formatAmount } from './generated/balance-domain.js';
import { quotaStatus, balancesBelow } from './generated/domain.js';
import { providerInfo } from './generated/provider-catalog.js';
import './balance.css';
import { t, locale } from './i18n.js';
const currencyName = (code) => (code === 'CNY' ? t('人民币') : t('美元'));
// T10.1: each balance platform's own names for the parts of its balance. DeepSeek: total = granted + topped up;
// Kimi: available = cash + voucher, and negative cash (arrears) leaves only the voucher.
const BRAND = {
  deepseek: 'DeepSeek',
  kimi: 'Kimi 开放平台',
  siliconflow: '硅基流动',
  stepfun: '阶跃星辰',
  'zenmux-payg': 'ZenMux',
};
const brand = (state) => t(BRAND[state.provider] || providerInfo(state.provider)?.name || '平台');
const kimiRow = (row) => row && 'voucher' in row;
// T13.3: StepFun reports only the available balance (its cash / voucher figures are lifetime totals, not parts).
const plainRow = (row) => row && !('voucher' in row) && !('granted' in row);
// T13.3: SiliconFlow's reference does not explain its three amounts; their reading follows its example.
const PART_NOTE = {
  siliconflow: '赠金与充值两项的含义官方文档没有写明，按官方示例（赠金 + 充值 = 总余额）推断。',
};
const unavailableText = (state) =>
  state.provider === 'kimi' ? t('可用余额已用完，暂不能调用 API') : t('当前余额不可用于 API 调用');
export function BalanceDashboard({ state, onSettings, onTools }) {
  const { data } = state,
    balance = data.parts.balance,
    rows = balance?.balances || [],
    stale = data.status !== 'connected',
    account = state.accounts?.find((a) => a.id === state.activeAccountId),
    [status, tone] = quotaStatus(state),
    // T14.2: currencies below the user's reminder amount.
    low = new Set(balance ? balancesBelow(balance, state.settings).map((b) => b.currency) : []);
  return (
    <div className="balance-dashboard">
      <div className="account-line">
        <span>
          <span className={'status-dot ' + tone} />
          {account?.label || brand(state)} {t('· 官方按量账户')}
        </span>
        <ProviderStatusLine status={state.providerStatus} fallback={t('账户余额')} />
      </div>
      {(data.errors.length > 0 || state.credentialIssue) && (
        <div className="inline-warning" role="status">
          <WarningCircle size={17} />
          <span>
            {state.credentialIssue || data.errors[0].message}
            {balance ? t(' 当前显示上次成功的余额，不能代表实时金额。') : ''}
          </span>
          {data.status === 'auth-error' && (
            <button onClick={onSettings}>
              {t('重新连接')}
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
              ACCOUNT BALANCE <span className="label-cn">{t('/ 账户余额')}</span>
            </span>
          </div>
          <span className={'status-tag ' + tone}>{t(status)}</span>
        </div>
        <p className="balance-availability">
          {balance
            ? t('{v0}：{v1}', {
                v0: stale ? t('上次返回') : t('官方返回'),
                v1: balance.isAvailable ? t('有可供 API 调用的余额') : unavailableText(state),
              })
            : t('连接后查询官方账户余额')}{' '}
          {t('· 各币种分别显示')}
        </p>
        <div className="balance-grid">
          {rows.map((row) =>
            kimiRow(row) ? (
              <KimiBalance row={row} stale={stale} low={low.has(row.currency)} key={row.currency} />
            ) : plainRow(row) ? (
              <section className="balance-currency" key={row.currency} aria-label={row.currency + t(' 余额')}>
                <div className="micro-label">
                  {row.currency} / {currencyName(row.currency)}
                </div>
                <h2>
                  {stale ? t('上次可用余额') : t('可用余额')}
                  {low.has(row.currency) && <LowTag />}
                </h2>
                <strong className="balance-total mono">
                  {formatAmount(row.total)} <small>{row.currency}</small>
                </strong>
                {balance.postpaid && <p>{t('后付费账户：用量事后结算，余额为 0 也可以继续调用。')}</p>}
              </section>
            ) : (
              <section className="balance-currency" key={row.currency} aria-label={row.currency + t(' 余额')}>
                <div className="micro-label">
                  {row.currency} / {currencyName(row.currency)}
                </div>
                <h2>
                  {stale ? t('上次可用余额') : t('总可用余额')}
                  {low.has(row.currency) && <LowTag />}
                </h2>
                <strong className="balance-total mono">
                  {formatAmount(row.total)} <small>{row.currency}</small>
                </strong>
                <dl>
                  <div>
                    <dt>{t('赠金余额')}</dt>
                    <dd className="mono">
                      {formatAmount(row.granted)} <small>{row.currency}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('充值余额')}</dt>
                    <dd className="mono">
                      {formatAmount(row.toppedUp)} <small>{row.currency}</small>
                    </dd>
                  </div>
                </dl>
                <p>
                  {t('总余额包含赠金与充值余额，三项不重复相加。')}
                  {PART_NOTE[state.provider] ? ' ' + t(PART_NOTE[state.provider]) : ''}
                </p>
              </section>
            ),
          )}
        </div>
        {!rows.length && (
          <div className="provider-empty">
            {data.fetching
              ? t('正在查询余额…')
              : balance
                ? t('官方尚未返回币种余额条目，金额保持未知。')
                : t('暂无可展示的余额，请先连接账户。')}
          </div>
        )}
        <p className="analysis-note">
          {t('余额查询时间：')}
          {data.updatedAt.balance ? new Date(data.updatedAt.balance).toLocaleString(locale()) : t('尚未成功查询')}
          {stale && balance ? t(' · 上次数据') : ''}
        </p>
        <div className="quota-footer">
          <Info size={14} />
          <span>
            <Disclosure
              summary={t('余额变化不等于消费')}
              detail={
                (state.provider === 'kimi' ? t('可能包含充值和代金券。') : t('可能包含充值和赠金。')) +
                t('缺失金额显示“—”，不默认换汇。')
              }
            />
          </span>
        </div>
      </section>
      <section className="panel balance-tools">
        <div>
          <h2>{t('工具 Token 与估算费用')}</h2>
          <p>
            <Disclosure
              summary={t('本机工具独立统计，费用为估算')}
              detail={t('可按人工确认的计费账户关联范围查看。费用来自已配置的模型单价，不是 {v0} 官方账单。', {
                v0: brand(state),
              })}
            />
          </p>
        </div>
        <button className="button" onClick={onTools}>
          {t('查看工具分析')}
          <ArrowUpRight size={14} />
        </button>
      </section>
      <div className="provider-data-note">
        <Info size={16} />
        <p>
          <Disclosure
            summary={t('只查询余额')}
            detail={t(
              '不提供完整历史账单、Token 汇总或套餐额度百分比。同一账户的不同 Key 可能共享余额，各连接不相加。',
            )}
          />
        </p>
      </div>
    </div>
  );
}
// T10.1 (D16 ②): the available balance is the main figure; voucher and cash go into the details. Negative cash is
// arrears and stays visible (a warning is never folded away, T6.3).
const LowTag = () => <span className="status-tag amber balance-arrears">{t('低于提醒金额')}</span>;
function KimiBalance({ row, stale, low }) {
  return (
    <section className="balance-currency" aria-label={row.currency + t(' 余额')}>
      <div className="micro-label">
        {row.currency} / {currencyName(row.currency)}
      </div>
      <h2>
        {stale ? t('上次可用余额') : t('可用余额')}
        {row.arrears && <span className="status-tag amber balance-arrears">{t('欠费')}</span>}
        {low && <LowTag />}
      </h2>
      <strong className="balance-total mono">
        {formatAmount(row.total)} <small>{row.currency}</small>
      </strong>
      {row.arrears && <p className="balance-arrears-note">{t('现金余额为负，可用余额只计代金券。')}</p>}
      <p>
        <Disclosure
          summary={t('可用余额 = 现金余额 + 代金券余额')}
          detail={t('代金券余额 {v0} {v1}；现金余额 {v2} {v3}{v4}。三项不重复相加。', {
            v0: formatAmount(row.voucher),
            v1: row.currency,
            v2: formatAmount(row.cash),
            v3: row.currency,
            v4: row.arrears ? t('（欠费）') : '',
          })}
        />
      </p>
    </section>
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
        <strong>{account?.label || providerInfo(state.provider)?.name || t('按量余额')}</strong>
        <small>
          {t(status)}
          {stale && balance ? t(' · 上次余额') : ''}
        </small>
      </div>
      {balance?.balances.map((row) => (
        <section className="balance-widget-currency" key={row.currency}>
          <div className="widget-row">
            <span>
              {row.currency} {currencyName(row.currency)}
              {row.arrears ? t(' · 欠费') : ''}
            </span>
            <strong className="mono">{formatAmount(row.total)}</strong>
          </div>
          {state.settings.widgetExpanded && kimiRow(row) && (
            <dl>
              <div>
                <dt>{t('代金券')}</dt>
                <dd>
                  {formatAmount(row.voucher)} {row.currency}
                </dd>
              </div>
              <div>
                <dt>
                  {t('现金')}
                  {row.arrears ? t('（欠费）') : ''}
                </dt>
                <dd>
                  {formatAmount(row.cash)} {row.currency}
                </dd>
              </div>
            </dl>
          )}
          {state.settings.widgetExpanded && !kimiRow(row) && !plainRow(row) && (
            <dl>
              <div>
                <dt>{t('赠金')}</dt>
                <dd>
                  {formatAmount(row.granted)} {row.currency}
                </dd>
              </div>
              <div>
                <dt>{t('充值')}</dt>
                <dd>
                  {formatAmount(row.toppedUp)} {row.currency}
                </dd>
              </div>
            </dl>
          )}
        </section>
      ))}
      {!balance?.balances.length && <p className="provider-empty">{t('余额金额暂未返回')}</p>}
      <small className="widget-synced">
        {t('不同币种分别显示 · 余额不等于消费')}
        {state.settings.widgetExpanded && (
          <>
            <br />
            {t('查询时间：')}
            {state.data.updatedAt.balance
              ? new Date(state.data.updatedAt.balance).toLocaleTimeString(locale())
              : t('尚未查询')}
          </>
        )}
      </small>
    </div>
  );
}
