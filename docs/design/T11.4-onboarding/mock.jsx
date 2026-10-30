// T11.4 D10 mock (not shipped): first-run wizard on the overview, and the "advanced" settings area. Built from the
// app's own styles and the platform registry metadata; sample data only.
// ?view=step1 | step2 | step3 | win | settings | settings-open  &theme=dark
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  ArrowUpRight,
  CaretDown,
  CaretRight,
  ChartBar,
  Check,
  Database,
  GearSix,
  Info,
  Key,
  Link,
  Moon,
  PushPin,
  ShieldCheck,
  SquaresFour,
  ArrowsLeftRight,
} from '@phosphor-icons/react';
import { BrandMark } from '../../../src/BrandMark.jsx';
import { verificationBadge } from '../../../src/ProviderViews.jsx';
import { PROVIDERS, providerInfo } from '../../../src/generated/provider-catalog.js';
import '../../../src/styles.css';
import '../../../src/desktop.css';
import '../../../src/providers.css';
import './mock.css';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'step1';
const dark = q.get('theme') === 'dark';
const win = view === 'win';

const GROUPS = [
  ['套餐额度', ['commandcode', 'glm', 'minimax', 'volcengine', 'opencode-go']],
  ['订阅额度（本机登录，无需 Key）', ['codex', 'claude']],
  ['按量余额', ['deepseek', 'kimi']],
  ['Key 上限与花费', ['openrouter']],
];
const STEPS = ['选择平台', '填写密钥', '本机工具（可选）', ...(win ? ['固定托盘图标'] : [])];
const current = { step1: 0, step2: 1, step3: 2, win: 3 }[view] ?? 0;

function Shell({ crumb, active, children }) {
  return (
    <div className={'app native-app' + (dark ? ' dark' : '')}>
      <div className="app-shell">
        <aside className="rail" aria-label="主导航">
          <button className="app-mark" aria-label="返回用量总览">
            <BrandMark size={27} />
          </button>
          <div className="rail-nav">
            {[
              ['overview', ChartBar],
              ['analytics', SquaresFour],
              ['coverage', ArrowsLeftRight],
              ['settings', GearSix],
            ].map(([id, Icon]) => (
              <button key={id} className={'icon-button' + (id === active ? ' active' : '')} aria-label={id}>
                <Icon size={21} />
              </button>
            ))}
          </div>
          <div className="rail-bottom">
            <button className="icon-button" aria-label="主题">
              <Moon size={20} />
            </button>
            <button className="icon-button" aria-label="口径">
              <Info size={20} />
            </button>
          </div>
        </aside>
        <div className="app-body">
          <header className="titlebar">
            <div className="breadcrumb">
              <span className="brand">Token 用量助手</span>
              <span className="slash">/</span>
              <span>{crumb}</span>
              <span className="desktop-badge">DESKTOP</span>
            </div>
            <div className="window-actions">
              <span className="version-tag">v1.9.0</span>
            </div>
          </header>
          <main className="main-content">{children}</main>
        </div>
      </div>
    </div>
  );
}

function Stepper() {
  return (
    <ol className="wz-steps">
      {STEPS.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''}>
          <span className="wz-num">{i < current ? <Check size={11} weight="bold" /> : i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

function Tile({ id, selected }) {
  const info = providerInfo(id),
    badge = verificationBadge(id);
  return (
    <button className={'wz-tile' + (selected ? ' selected' : '')} aria-pressed={selected}>
      <span className="wz-tile-head">
        <b>{info.name}</b>
        {badge && <em className={'ui-select-badge ' + badge.tone}>{badge.text}</em>}
      </span>
      <small>{info.regions.map((r) => r.name).join(' / ')}</small>
    </button>
  );
}

function Step1() {
  return (
    <>
      <p className="wz-lead">选一个你在用的平台。之后可以在「账户与设置」里继续添加，最多 20 个账户。</p>
      {GROUPS.map(([title, ids]) => (
        <section key={title} className="wz-group">
          <div className="wz-group-title">{title}</div>
          <div className="wz-tiles">
            {ids.map((id) => (
              <Tile key={id} id={id} selected={id === 'glm'} />
            ))}
          </div>
        </section>
      ))}
      <div className="wz-region">
        <span>GLM Coding Plan 的站点</span>
        <span className="wz-chips">
          <button className="wz-chip selected">国内 · 智谱</button>
          <button className="wz-chip">国际 · Z.ai</button>
        </span>
      </div>
    </>
  );
}

function Step2() {
  const info = providerInfo('glm');
  return (
    <div className="wz-key">
      <div className="wz-picked">
        <b>{info.name}</b>
        <span>国内 · 智谱</span>
        <button className="panel-link">换一个</button>
      </div>
      <p className="provider-form-note">{info.note}</p>
      <label htmlFor="wz-label">
        账户备注 <span>可选，方便区分多个连接</span>
      </label>
      <input id="wz-label" placeholder={info.name} readOnly />
      <label htmlFor="wz-key">{info.name} API Key</label>
      <input id="wz-key" type="password" value="••••••••••••••••••••" readOnly />
      <ul className="wz-promise">
        <li>
          <ShieldCheck size={15} />
          Key 只加密保存在这台电脑（Windows 用 DPAPI，Mac 用钥匙串），只发给该平台自己的接口，不写进日志。
        </li>
        <li>
          <ShieldCheck size={15} />
          只调用 {info.name} 官方的只读额度接口：不调用模型、不消耗额度、不修改账户。
        </li>
      </ul>
      <div className="wz-actions">
        <button className="panel-link">
          在官方控制台获取 Key <ArrowUpRight size={13} />
        </button>
        <button className="button primary">
          连接并继续 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

const TOOLS = [
  ['Codex', '自动识别本机的 Codex 配置（~/.codex）', true],
  ['Claude Code', '生成启动脚本，采集之后的用量事件', false],
  ['OpenCode', '只读本机数据库里的用量元数据', false],
  ['Zcode', '只读本机数据库里的用量元数据', false],
  ['DeepSeek Harness', '需要先在 Harness 里装用量导出插件', false],
];
function Step3() {
  return (
    <>
      <div className="wz-done">
        <Check size={15} weight="bold" />
        已连接 GLM Coding Plan · 国内 · 智谱
      </div>
      <p className="wz-lead">
        还想看本机编程工具的 Token 用量？选你用的工具（只读用量元数据，不读对话内容）。这些统计与平台额度分开，不相加。
      </p>
      <div className="wz-tools">
        {TOOLS.map(([name, note, found]) => (
          <div className="wz-tool" key={name}>
            <Database size={16} />
            <span>
              <b>{name}</b>
              <small>{note}</small>
            </span>
            {found && <em className="wz-found">已找到</em>}
            <button className="button">添加</button>
          </div>
        ))}
      </div>
      <div className="wz-actions">
        <span />
        <button className="button primary">完成</button>
      </div>
    </>
  );
}

function StepWin() {
  return (
    <>
      <div className="wz-done">
        <Check size={15} weight="bold" />
        已连接 GLM Coding Plan · 已添加 Codex
      </div>
      <div className="wz-pin">
        <PushPin size={20} />
        <div>
          <b>把托盘图标固定到任务栏</b>
          <p>
            Windows 可能把新图标收在任务栏的「^」里。想一直显示：右键任务栏 → 任务栏设置 → 其他系统托盘图标，打开「Token
            用量助手」（Windows 10 为「选择哪些图标显示在任务栏上」）。
          </p>
          <p>托盘图标的刻度环是剩余最少的账户窗口；左键打开用量面板，悬停看各账户的数值。只给说明，不改系统设置。</p>
        </div>
      </div>
      <div className="wz-actions">
        <span />
        <button className="button primary">开始使用</button>
      </div>
    </>
  );
}

function Wizard() {
  return (
    <Shell crumb="Usage" active="overview">
      <div className="page-heading">
        <div>
          <div className="eyebrow">GET STARTED</div>
          <h1>
            <span>//</span>开始使用
          </h1>
          <p>三步连好账户，之后在托盘和悬浮窗里一眼看全。</p>
        </div>
        <div className="heading-actions">
          <button className="button">跳过，稍后在设置里连接</button>
        </div>
      </div>
      <section className="panel wz-panel">
        <Stepper />
        {view === 'step2' ? <Step2 /> : view === 'step3' ? <Step3 /> : win ? <StepWin /> : <Step1 />}
      </section>
      <p className="wz-foot">
        <Info size={14} />
        只在没有任何账户和工具来源时出现；点「跳过」后不再自动弹出。已有数据的用户升级后不会看到。
      </p>
    </Shell>
  );
}

function Settings({ open }) {
  return (
    <Shell crumb="Settings" active="settings">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR USAGE, AT A GLANCE</div>
          <h1>
            <span>//</span>账户与设置
          </h1>
          <p>本机连接账户，让助手按你的节奏工作。</p>
        </div>
      </div>
      <div className="panel st-ghost" aria-hidden="true">
        <div className="section-title">
          <Key size={16} />
          ACCOUNT CONNECTION
        </div>
        <div className="st-ghost-body">（账户连接，不变）</div>
      </div>
      <div className="panel st-ghost" aria-hidden="true">
        <div className="section-title">
          <Database size={16} />
          TOOL DATA SOURCES
        </div>
        <div className="st-ghost-body">（工具数据源，不变）</div>
      </div>
      <section className={'panel st-advanced' + (open ? ' open' : '')}>
        <button className="st-advanced-head" aria-expanded={open}>
          {open ? <CaretDown size={15} /> : <CaretRight size={15} />}
          <span className="section-title">
            ADVANCED <span className="label-cn">/ 高级</span>
          </span>
          <span className="st-advanced-sum">计费账户归组 · 工具记录关联</span>
          <span className="st-advanced-state">{open ? '收起' : '展开'}</span>
        </button>
        <p className="st-advanced-note">
          只有要把本机工具的记录对到某个计费账户、或要把同一账户的多把 Key 归成一组时才需要。默认收起，已有的归组与关联照常生效。
        </p>
        {open && (
          <div className="st-advanced-body">
            <div className="section-title">
              <Link size={16} />
              ACCOUNT LINKS
            </div>
            <h2>计费账户与工具关联</h2>
            <h3>1. 计费账户归组</h3>
            <div className="st-ghost-body">（现有内容原样移入，不改逻辑）</div>
            <h3>2. 工具记录关联</h3>
            <div className="st-ghost-body">（现有内容原样移入，不改逻辑）</div>
          </div>
        )}
      </section>
      <div className="panel st-ghost" aria-hidden="true">
        <div className="section-title">
          <GearSix size={16} />
          PREFERENCES
        </div>
        <div className="st-ghost-body">（偏好设置，不变）</div>
      </div>
    </Shell>
  );
}

function App() {
  if (view === 'settings') return <Settings open={false} />;
  if (view === 'settings-open') return <Settings open />;
  return <Wizard />;
}
// The registry's platform list must match the groups above (a mock check, not shipped).
const listed = GROUPS.flatMap(([, ids]) => ids);
if (PROVIDERS.some((p) => !listed.includes(p.id))) console.warn('platform missing from the mock groups');
createRoot(document.getElementById('root')).render(<App />);
