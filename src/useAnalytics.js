import { useEffect, useRef, useState } from 'react';
export function useAnalytics(bridge, query, state, enabled = true) {
  const [report, setReport] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    [tick, setTick] = useState(0);
  const queryKey = JSON.stringify(query),
    active = useRef(null);
  // Each new request (same inputs as the fetch effect below) starts in the loading state; a new query or revision
  // also clears the previous report. Done during render instead of inside the effect.
  const live = enabled && !!state && !!bridge.analytics,
    request = live
      ? JSON.stringify([queryKey, state.data.updatedAt.summary, state.analyticsRevision, reload, tick])
      : null,
    [started, setStarted] = useState({ request: null, report: '' });
  if (request !== started.request) {
    const reportKey = live ? queryKey + '|' + state.analyticsRevision : started.report;
    setStarted({ request, report: reportKey });
    if (live) {
      if (reportKey !== started.report) setReport(null);
      setLoading(true);
      setError('');
    }
  }
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((n) => n + 1), (state?.settings.refreshSeconds || 60) * 1000);
    return () => clearInterval(id);
  }, [enabled, state?.settings.refreshSeconds]);
  useEffect(() => {
    if (!enabled || !state || !bridge.analytics) return;
    let alive = true;
    const requestId = crypto.randomUUID();
    active.current = requestId;
    bridge
      .analytics({ ...JSON.parse(queryKey), requestId, force: reload > 0 })
      .then((r) => {
        if (!alive || active.current !== requestId) return;
        if (!r.ok) throw new Error(r.error);
        setReport(r.value);
      })
      .catch((e) => {
        if (alive && active.current === requestId) setError(e.message || '分析暂时无法加载');
      })
      .finally(() => {
        if (alive && active.current === requestId) {
          active.current = null;
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      bridge.cancelAnalytics?.(requestId);
    };
  }, [queryKey, enabled, !!state, state?.data.updatedAt.summary, state?.analyticsRevision, reload, tick]);
  return {
    report,
    loading,
    error,
    refresh: () => setReload((n) => n + 1),
    cancel: () => {
      const id = active.current;
      active.current = null;
      if (id) bridge.cancelAnalytics?.(id);
      setLoading(false);
      setError('分析已取消，可重新刷新。');
    },
  };
}
