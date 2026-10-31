import { useState } from 'react';
import { ArrowRight, CaretDown, CaretRight, Check, Database, Info, PushPin } from '@phosphor-icons/react';
import { ConnectionForm, verificationBadge } from './ProviderViews.jsx';
import { kindName } from './ToolSources.jsx';
import { PROVIDERS, providerInfo } from './generated/provider-catalog.js';
import { providerGroups, wizardSteps } from './generated/onboarding.js';
import './onboarding.css';

// T11.4 (D10, mock in docs/design/T11.4-onboarding/): the first-run wizard on the overview. It only opens while
// there is no account and no tool source (desktop/onboarding.cjs); "skip" and "finish" both turn it off for good.
// Connecting and adding sources go through the same bridge calls as settings; nothing here reads files by itself.

const GROUPS = providerGroups(PROVIDERS);
const TOOLS = [
  ['codex', '选择 Codex 配置目录（通常是 ~/.codex）'],
  ['claude-code', '连接 Claude 订阅时自动添加；也可选择已导出的 usage.jsonl'],
  ['opencode', '选择 opencode.db，只读用量元数据'],
  ['zcode', '选择 Zcode 的用量数据库，只读用量元数据'],
  ['harness', '先在 Harness 里启用用量导出插件，再选择导出的 usage.jsonl'],
];

// The browser preview can open a later step (?desktop-preview=empty&step=2) for screenshots.
const previewStep = (preview) =>
  preview ? Math.min(3, Number(new URLSearchParams(location.search).get('step')) || 0) : 0;

export function SetupHeading({ mac, onSkip }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">GET STARTED</div>
        <h1>
          <span>//</span> 开始使用
        </h1>
        <p>三步连好账户，之后在{mac ? '菜单栏' : '托盘'}和悬浮窗里一眼看全。</p>
      </div>
      <div className="heading-actions">
        <button className="button" onClick={onSkip}>
          跳过，稍后在设置里连接
        </button>
      </div>
    </div>
  );
}

export function SetupWizard({ state, preview, connect, addSource, finish }) {
  const win = state.platform === 'win32';
  const [step, setStep] = useState(() => previewStep(preview)),
    [provider, setProvider] = useState('glm'),
    [region, setRegion] = useState(() => providerInfo('glm').regions[0].id),
    [connected, setConnected] = useState(() =>
      previewStep(preview) >= 2 ? { provider: 'glm', region: providerInfo('glm').regions[0].id } : null,
    ),
    [pending, setPending] = useState(null);
  const info = providerInfo(provider),
    steps = wizardSteps({ platform: state.platform, credential: info.credential }),
    sources = state.toolSources || [];
  function choose(id) {
    setProvider(id);
    setRegion(providerInfo(id).regions[0].id);
  }
  async function add(kind) {
    if (pending) return;
    setPending(kind);
    try {
      await addSource(kind, kindName(kind));
    } finally {
      setPending(null);
    }
  }
  const done = [
    connected &&
      `已连接 ${providerInfo(connected.provider).name} · ${
        providerInfo(connected.provider).regions.find((r) => r.id === connected.region)?.name
      }`,
    ...sources.map((s) => `已添加 ${kindName(s.kind)}`),
  ].filter(Boolean);
  return (
    <>
      <section className="panel wz-panel" aria-label="首次使用向导">
        <ol className="wz-steps">
          {steps.map((title, i) => (
            <li key={title} className={i < step ? 'done' : i === step ? 'current' : ''}>
              <span className="wz-num">{i < step ? <Check size={11} weight="bold" /> : i + 1}</span>
              {title}
            </li>
          ))}
        </ol>
        {step === 0 && (
          <>
            <p className="wz-lead">选一个你在用的平台。之后可以在「账户与设置」里继续添加，最多 20 个账户。</p>
            {GROUPS.map((group) => (
              <section key={group.id} className="wz-group">
                <div className="wz-group-title">{group.title}</div>
                <div className="wz-tiles">
                  {group.providers.map((p) => {
                    const badge = verificationBadge(p.id);
                    return (
                      <button
                        key={p.id}
                        className={'wz-tile' + (p.id === provider ? ' selected' : '')}
                        aria-pressed={p.id === provider}
                        onClick={() => choose(p.id)}
                      >
                        <span className="wz-tile-head">
                          <b>{p.name}</b>
                          {badge && <em className={'ui-select-badge ' + badge.tone}>{badge.text}</em>}
                        </span>
                        <small>{p.regions.map((r) => r.name).join(' / ')}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {info.regions.length > 1 && (
              <div className="wz-region">
                <span>{info.name} 的站点</span>
                <span className="wz-chips" role="group" aria-label="选择站点">
                  {info.regions.map((r) => (
                    <button
                      key={r.id}
                      className={'wz-chip' + (r.id === region ? ' selected' : '')}
                      aria-pressed={r.id === region}
                      onClick={() => setRegion(r.id)}
                    >
                      {r.name}
                    </button>
                  ))}
                </span>
              </div>
            )}
            <div className="wz-actions">
              <button className="panel-link" onClick={() => setStep(2)}>
                只用本机工具，先不连平台
              </button>
              <button className="button primary" onClick={() => setStep(1)}>
                下一步
                <ArrowRight size={15} />
              </button>
            </div>
          </>
        )}
        {step === 1 && (
          <ConnectionForm
            key={provider + '/' + region}
            state={state}
            preview={preview}
            action={connect}
            onConnected={() => {
              setConnected({ provider, region });
              setStep(2);
            }}
            wizard={{ provider, region, onBack: () => setStep(0) }}
          />
        )}
        {step === 2 && (
          <>
            {done.length > 0 && (
              <div className="wz-done">
                <Check size={15} weight="bold" />
                {done.join(' · ')}
              </div>
            )}
            <p className="wz-lead">
              还想看本机编程工具的 Token
              用量？选你用的工具（只读用量元数据，不读对话内容）。这些统计与平台额度分开，不相加。
            </p>
            <div className="wz-tools">
              {TOOLS.map(([kind, note]) => {
                const added = sources.some((s) => s.kind === kind);
                return (
                  <div className="wz-tool" key={kind}>
                    <Database size={16} />
                    <span>
                      <b>{kindName(kind)}</b>
                      <small>{note}</small>
                    </span>
                    {added && <em className="wz-found">已添加</em>}
                    <button className="button" disabled={!!pending || preview} onClick={() => add(kind)}>
                      {pending === kind ? '正在添加' : added ? '再添加一个' : '添加'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="wz-actions">
              <span>
                {!connected && (
                  <button className="panel-link" onClick={() => setStep(0)}>
                    返回选择平台
                  </button>
                )}
              </span>
              <button className="button primary" onClick={() => (win ? setStep(3) : finish())}>
                {win ? '下一步' : '完成'}
                {win && <ArrowRight size={15} />}
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            {done.length > 0 && (
              <div className="wz-done">
                <Check size={15} weight="bold" />
                {done.join(' · ')}
              </div>
            )}
            <div className="wz-pin">
              <PushPin size={20} />
              <div>
                <b>把托盘图标固定到任务栏</b>
                <p>
                  Windows 可能把新图标收在任务栏的「^」里。想一直显示：右键任务栏 → 任务栏设置 →
                  其他系统托盘图标，打开「Token 用量助手」（Windows 10 为「选择哪些图标显示在任务栏上」）。
                </p>
                <p>
                  托盘图标的刻度环是剩余最少的账户窗口；左键打开用量面板，悬停看各账户的数值。只给说明，不改系统设置。
                </p>
              </div>
            </div>
            <div className="wz-actions">
              <span />
              <button className="button primary" onClick={finish}>
                开始使用
              </button>
            </div>
          </>
        )}
      </section>
      <p className="wz-foot">
        <Info size={14} />
        只在没有任何账户和工具来源时出现；点「跳过」后不再自动弹出。已有数据的用户升级后不会看到。
      </p>
    </>
  );
}

// T11.4: "billing account groups / tool record links" sit in a collapsed "advanced" area in settings. Collapsed by
// default and not remembered (T6.3); links that need the user to re-confirm them keep it open and are counted on the
// header, because a prompt that needs action is never folded away (AGENTS §8).
export function AdvancedSettings({ associations, children }) {
  const data = associations || { groups: [], rules: [] },
    review = [...(data.groups || []), ...(data.rules || [])].filter((item) => item.valid === false).length,
    attention = review > 0 || !!data.issue;
  const [open, setOpen] = useState(attention);
  if (attention && !open) setOpen(true);
  return (
    <section className={'panel st-advanced' + (open ? ' open' : '')}>
      <button className="st-advanced-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <CaretDown size={15} /> : <CaretRight size={15} />}
        <span className="section-title">
          ADVANCED <span className="label-cn">/ 高级</span>
        </span>
        <span className="st-advanced-sum">
          计费账户归组 · 工具记录关联
          {review > 0 && <span className="amber-text">{review} 项待重新确认</span>}
        </span>
        <span className="st-advanced-state">{open ? '收起' : '展开'}</span>
      </button>
      <p className="st-advanced-note">
        只有要把本机工具的记录对到某个计费账户、或要把同一账户的多把 Key
        归成一组时才需要。默认收起，已有的归组与关联照常生效。
      </p>
      {open && <div className="st-advanced-body">{children}</div>}
    </section>
  );
}
