import { ArrowUpRight } from '@phosphor-icons/react';
import { previewBridge } from './desktop-preview.js';
import { Live } from './Live.jsx';
import { t } from './i18n.js';

const bridge = window.tokenAssistant || previewBridge;
const ago = (at, now) => {
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  return minutes < 1
    ? t('刚刚查询')
    : minutes < 60
      ? t('{v0} 分钟前查询', { v0: minutes })
      : t('{v0} 小时前查询', { v0: Math.floor(minutes / 60) });
};
// T14.3 (D21 ③): the platform's official status page, next to the account line. A hint only: it never changes the
// quota or balance figures. Shown only while the setting is on and the platform has a page (main sends null otherwise).
export function ProviderStatusLine({ status, fallback }) {
  if (!status) return <span>{fallback}</span>;
  const known = status.indicator !== null;
  return (
    <span className="ps-line">
      <span className={'status-dot ' + status.tone} />
      {status.name} {t('官方状态：')}
      <b className={'ps-' + status.tone}>{status.text}</b>
      <span className="ps-sep">·</span>
      {known ? (
        <Live intervalMs={30000}>
          {(now) => ago(status.checkedAt, now) + (status.failing ? t('（最近一次没取到）') : '')}
        </Live>
      ) : (
        t('暂时取不到（不影响额度查询）')
      )}
      <button className="ps-link" onClick={() => bridge.openStatusPage?.()}>
        {t('状态页')} <ArrowUpRight size={11} />
      </button>
    </span>
  );
}
