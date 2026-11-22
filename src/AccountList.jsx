import { PencilSimple, Plus, Trash, UserList, X } from '@phosphor-icons/react';
import { providerInfo } from './generated/provider-catalog.js';
import { t, locale } from './i18n.js';
import './account-list.css';

// T17.3 (D24 ②): the settings' accounts tab lists every saved account (name, platform and region, status, last
// success) with edit and remove, instead of picking the account and the action from two dropdowns.
const STATUS = {
  'auth-error': { tone: 'red', text: '需要重新连接' },
  offline: { tone: 'amber', text: '连接中断' },
  stale: { tone: 'amber', text: '数据未更新' },
  partial: { tone: 'amber', text: '部分数据' },
};
function statusOf(account, row) {
  if (STATUS[account.status]) return STATUS[account.status];
  if (row && !row.synced) return { tone: 'neutral', text: '尚未同步' };
  return { tone: 'green', text: '正常' };
}
const when = (v) => {
  if (!v) return '—';
  const d = new Date(v),
    today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleString(locale(), {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
};

// `form` is the connection form for the account being edited (shown right under its row) or for a new one.
export function AccountList({ state, editing, disabled, onAdd, onEdit, onRemove, onRetry, form = null }) {
  const accounts = state.accounts || [],
    rows = new Map((state.overview?.rows || []).map((r) => [r.id, r]));
  return (
    <section className="panel account-list" aria-labelledby="account-list-title">
      <div className="al-head">
        <div>
          <div className="section-title">
            <UserList size={16} />
            ACCOUNTS <span className="label-cn">{t('/ 账户')}</span>
          </div>
          <p id="account-list-title">
            {state.credentialIssue
              ? t(state.credentialIssue)
              : accounts.length
                ? t('已保存 {v0} 个账户，最多 20 个；每个账户独立刷新、独立提醒。', { v0: accounts.length })
                : t('还没有账户。添加一个官方套餐或按量账户开始监测。')}
          </p>
        </div>
        {/* T17.8: while the saved list cannot be read, adding is blocked (it would fail), re-reading is offered. */}
        {state.credentialIssue ? (
          <button className="button primary" onClick={onRetry}>
            {t('重新读取')}
          </button>
        ) : (
          <button
            className={'button primary' + (editing?.mode === 'add' ? ' selected' : '')}
            disabled={disabled || accounts.length >= 20}
            onClick={onAdd}
          >
            {editing?.mode === 'add' ? <X size={15} /> : <Plus size={15} />}
            {editing?.mode === 'add' ? t('取消添加') : t('添加账户')}
          </button>
        )}
      </div>
      {form && editing?.mode !== 'update' && <div className="al-form adding">{form}</div>}
      {accounts.length > 0 && (
        <div className="al-table" role="table" aria-label={t('已保存的账户')}>
          <div className="al-row al-row-head" role="row">
            <span role="columnheader">{t('名称')}</span>
            <span role="columnheader">{t('平台与站点')}</span>
            <span role="columnheader">{t('状态')}</span>
            <span role="columnheader">{t('上次成功')}</span>
            <span role="columnheader" />
          </div>
          {accounts.map((a) => {
            const info = providerInfo(a.provider),
              row = rows.get(a.id),
              status = statusOf(a, row),
              open = editing?.mode === 'update' && editing.id === a.id;
            return [
              <div className={'al-row' + (open ? ' open' : '')} role="row" key={a.id}>
                <span role="cell" className="al-name">
                  <strong title={a.label}>{a.label}</strong>
                  {a.id === state.activeAccountId && <small>{t('总览当前显示')}</small>}
                </span>
                <span role="cell" className="al-provider">
                  {t(info?.name || a.provider)}
                  <small>{t(info?.regions.find((r) => r.id === a.region)?.name || a.region)}</small>
                </span>
                <span role="cell" className={'al-status ' + status.tone}>
                  <i />
                  {t(status.text)}
                </span>
                <span role="cell" className="al-when mono">
                  {row?.synced ? when(row.updatedAt) : '—'}
                </span>
                <span role="cell" className="al-actions">
                  <button
                    className={'text-button' + (status.tone === 'red' ? ' al-fix' : '')}
                    disabled={disabled}
                    onClick={() => onEdit(a.id)}
                  >
                    {open ? <X size={13} /> : <PencilSimple size={13} />}
                    {open ? t('收起') : status.tone === 'red' ? t('重新连接') : t('编辑')}
                  </button>
                  <button className="text-button" disabled={disabled} onClick={() => onRemove(a.id)}>
                    <Trash size={13} />
                    {t('移除')}
                  </button>
                </span>
              </div>,
              open && form ? (
                <div className="al-form" key={a.id + '-form'}>
                  {form}
                </div>
              ) : null,
            ];
          })}
        </div>
      )}
    </section>
  );
}
