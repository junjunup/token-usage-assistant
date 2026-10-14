import { rangeFor } from './generated/analytics-core.js';
import { aggregateTools, normalizeZcodeRecord, normalizeHarnessRecord } from './generated/tool-analytics.js';
import { sampleRows } from './generated/analytics-fixture.js';
export function demoTools(query, state, prices) {
  const now = Date.now(),
    range = rangeFor(query.range || 'today', now);
  if (!range.start)
    return { source: 'tools', range, status: 'unavailable', summary: null, message: '工具记录尚未关联到账期。' };
  const selected = (state.toolSources || []).filter(
    (s) => s.enabled && (!query.sourceIds?.length || query.sourceIds.includes(s.id)),
  );
  if (!selected.length)
    return { source: 'tools', range, status: 'unconfigured', summary: null, message: '请添加并启用工具数据源。' };
  const rows = [],
    reports = [];
  for (const source of selected) {
    const raw = sampleRows(now).filter((_, i) => (source.kind === 'zcode' ? i % 2 === 0 : i % 2 === 1));
    for (const row of raw)
      rows.push(
        source.kind === 'zcode'
          ? normalizeZcodeRecord(row, source.id)
          : normalizeHarnessRecord(
              {
                schema: 'token-usage-assistant.harness',
                schemaVersion: 1,
                sourceId: source.id,
                tool: 'deepseek-harness',
                harnessVersion: '0.1.7-rc.1',
                sessionId: row.session_id,
                requestId: row.id,
                attemptId: row.id,
                revision: 1,
                timestamp: row.started_at,
                updatedAt: row.started_at,
                provider: row.provider_id,
                model: row.model_id,
                project: row.directory,
                status: row.status === 'error' ? 'failed' : row.status,
                usageReported: true,
                usage: {
                  uncachedInputTokens: row.input_tokens - row.cache_read_input_tokens - row.cache_creation_input_tokens,
                  cacheReadTokens: row.cache_read_input_tokens,
                  cacheWriteTokens: row.cache_creation_input_tokens,
                  outputTokens: row.output_tokens,
                  totalTokens: row.computed_total_tokens,
                  reasoningTokens: null,
                },
              },
              source.id,
            ),
      );
    const current = raw.filter((r) => r.started_at >= range.start);
    reports.push({
      id: source.id,
      kind: source.kind,
      label: source.label,
      status: 'ready',
      lastSuccessAt: now,
      coverage: {
        start: current.length ? Math.min(...current.map((r) => r.started_at)) : null,
        end: current.length ? Math.max(...current.map((r) => r.started_at)) : null,
        complete: false,
      },
      truncated: false,
    });
  }
  return {
    ...aggregateTools(rows, range, query, prices, reports),
    status: 'ready',
    updatedAt: now,
    credits: null,
    prediction: null,
    accountId: null,
  };
}
