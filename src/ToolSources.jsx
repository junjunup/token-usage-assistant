import React, { useEffect, useState } from 'react';
import { Database, Folder, Plus, ArrowClockwise, WarningCircle, Trash, Check, Info } from '@phosphor-icons/react';
import { Select } from './Select.jsx';
import './tool-sources.css';

const kindName = (kind) =>
  ({ opencode: 'OpenCode', harness: 'DeepSeek Harness', zcode: 'Zcode', codex: 'Codex', 'claude-code': 'Claude Code' })[
    kind
  ] || kind;
const stamp = (value) =>
  value
    ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '尚未成功同步';
const statuses = {
  overlap: '来源重叠',
  ready: '已同步',
  idle: '等待同步',
  syncing: '同步中',
  missing: '找不到文件',
  unsupported: '格式暂不支持',
  schema: '格式暂不支持',
  stale: '数据需检查',
  error: '同步失败',
  partial: '部分数据',
  disabled: '已停用',
  cancelled: '已取消',
  timeout: '同步超时',
};

function SourceRow({ source, busy, run, onUpdate, onChoose, onRemove, onSync }) {
  const [label, setLabel] = useState(source.label || '');
  useEffect(() => setLabel(source.label || ''), [source.label]);
  const status = source.enabled === false ? 'disabled' : source.status || 'idle';
  const changed = label.trim() !== source.label && label.trim().length > 0;
  return (
    <li className="tool-source-row">
      <div className="tool-source-heading">
        <div className="tool-source-kind">
          <Database size={15} />
          <span>{kindName(source.kind)}</span>
          {source.formatVersion && <small>格式 v{source.formatVersion}</small>}
        </div>
        <span
          className={
            'tool-source-status ' +
            (status === 'ready' ? 'ready' : status === 'idle' || status === 'disabled' ? 'neutral' : 'attention')
          }
        >
          {statuses[status] || '等待同步'}
        </span>
      </div>
      <form
        className="tool-source-label"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed) run(source.id, () => onUpdate(source.id, { label: label.trim() }));
        }}
      >
        <label htmlFor={'source-label-' + source.id}>数据源名称</label>
        <input
          id={'source-label-' + source.id}
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
          autoComplete="off"
        />
        <button className="button" type="submit" disabled={busy || !changed}>
          <Check size={14} />
          保存名称
        </button>
      </form>
      <p className="tool-source-path" title={source.file || ''}>
        {source.file || '尚未选择文件'}
      </p>
      <div className="tool-source-meta">
        <span>最近成功 · {stamp(source.lastSuccessAt)}</span>
        {source.observedStartAt && (
          <span>
            已观察记录 · {stamp(source.observedStartAt)} — {stamp(source.observedEndAt)}
          </span>
        )}
      </div>
      {source.message && source.enabled !== false && (
        <p className="tool-source-message" role="status">
          <WarningCircle size={14} />
          {source.message}
        </p>
      )}
      <div className="tool-source-actions">
        <label className="tool-source-enabled">
          <input
            type="checkbox"
            checked={source.enabled !== false}
            disabled={busy}
            onChange={(e) => run(source.id, () => onUpdate(source.id, { enabled: e.target.checked }))}
          />
          <span>启用此数据源</span>
        </label>
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={() => run(source.id, () => onChoose(source.id))}
        >
          <Folder size={14} />
          更换位置
        </button>
        <button
          className="text-button"
          type="button"
          disabled={busy || source.enabled === false}
          onClick={() => run(source.id, () => onSync(source.id))}
        >
          <ArrowClockwise size={14} className={busy ? 'spin' : ''} />
          同步
        </button>
        <button
          className="text-button tool-source-remove"
          type="button"
          disabled={busy}
          aria-label={'移除数据源 ' + source.label}
          onClick={() => run(source.id, () => onRemove(source.id))}
        >
          <Trash size={14} />
          移除
        </button>
      </div>
    </li>
  );
}

export function ToolSources({ sources = [], onAdd, onUpdate, onChoose, onRemove, onSync }) {
  const [kind, setKind] = useState('zcode'),
    [label, setLabel] = useState(''),
    [pending, setPending] = useState(null),
    [error, setError] = useState('');
  async function run(id, callback) {
    setPending(id);
    setError('');
    try {
      const result = await callback();
      if (result === false) setError('操作未完成，请检查数据源后重试。');
      return result;
    } catch {
      setError('操作未完成，请检查文件位置及访问权限后重试。');
      return false;
    } finally {
      setPending(null);
    }
  }
  async function add(e) {
    e.preventDefault();
    const result = await run('add', () => onAdd(kind, label.trim() || kindName(kind)));
    if (result && result.cancelled !== true) setLabel('');
  }
  return (
    <section className="panel tool-sources-panel" aria-labelledby="tool-sources-title">
      <div className="tool-sources-title">
        <div className="section-title">
          <Database size={16} />
          TOOL DATA SOURCES
        </div>
        <h2 id="tool-sources-title">工具数据源</h2>
        <p>分别连接本机工具的用量记录。平台账户的切换不会改变记录归属。</p>
      </div>
      <form className="tool-source-add" onSubmit={add}>
        <label>
          工具
          <Select
            label="添加工具类型"
            value={kind}
            onChange={setKind}
            disabled={!!pending}
            options={[
              { value: 'opencode', label: 'OpenCode', description: '选择 opencode.db · 只读用量元数据' },
              { value: 'codex', label: 'Codex', description: '选择本机 Codex 配置目录 · 0.155.x' },
              { value: 'claude-code', label: 'Claude Code', description: '选择本地组件导出的 usage.jsonl' },
              { value: 'zcode', label: 'Zcode', description: '只读 SQLite 用量元数据' },
              { value: 'harness', label: 'DeepSeek Harness', description: '统计插件导出的专用 JSONL 文件' },
            ]}
          />
        </label>
        <label htmlFor="new-source-label">
          名称 <span>可选</span>
          <input
            id="new-source-label"
            value={label}
            maxLength={60}
            placeholder={kindName(kind)}
            onChange={(e) => setLabel(e.target.value)}
            disabled={!!pending}
          />
        </label>
        <button className="button" type="submit" disabled={!!pending}>
          <Plus size={14} />
          {pending === 'add' ? '正在添加' : kind === 'codex' ? '选择目录并添加' : '选择文件并添加'}
        </button>
      </form>
      {kind === 'opencode' && (
        <p className="analysis-note">
          选择 OpenCode 的 opencode.db；可在终端运行 opencode db path 查看位置。数据库只读连接，不需要填写 API Key。
        </p>
      )}
      {error && (
        <p className="tool-source-message" role="alert">
          <WarningCircle size={15} />
          {error}
        </p>
      )}
      {sources.length ? (
        <ul className="tool-source-list">
          {sources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              busy={!!pending}
              run={run}
              onUpdate={onUpdate}
              onChoose={onChoose}
              onRemove={onRemove}
              onSync={onSync}
            />
          ))}
        </ul>
      ) : (
        <div className="tool-source-empty">
          <Database size={24} />
          <span>尚未添加工具数据源</span>
          <small>
            连接上方订阅账户可添加 Codex / Claude Code 来源，也可选择 OpenCode / Zcode 数据库或 Harness 用量导出。
          </small>
        </div>
      )}
      <div className="tool-source-privacy">
        <Info size={15} />
        <div>
          <p>仅采集请求标识、时间、模型、项目、会话及 Token 等用量元数据，不采集对话正文、工具结果或凭据。</p>
          <p>
            Claude Code 从上方连接入口生成本地启动配置；Codex 读取 0.155.x 用量元数据。Harness
            需要启用随附的本地统计插件，从启用后开始记录，不补采原始历史会话。OpenCode 选择
            opencode.db，仅统计已保存的助手用量记录，不能据此核对完整请求成功率。移除数据源不会修改或删除工具原文件。
          </p>
        </div>
      </div>
    </section>
  );
}
