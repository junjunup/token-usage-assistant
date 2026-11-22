// What the assistant takes from Claude Code's status-line input, and the one line it sends back (T18.3). The collector
// in the app applies this to the input the macOS helper (claude-statusline.sh, plain sh + curl) passes on unchanged;
// the Windows helper (claude-statusline.ps1) picks the same fields itself and posts them to /quota.
// Only the fields in `schema` are decoded; everything else in the input (transcript path, cost, model, any field a
// later Claude Code adds) is skipped without being decoded, and nothing of it is kept.
const { projectJSON } = require('./metadata-json.cjs');
const schema = {
  version: true,
  session_id: true,
  workspace: { current_dir: true },
  rate_limits: {
    five_hour: { used_percentage: true, resets_at: true },
    seven_day: { used_percentage: true, resets_at: true },
  },
};
/** @param {string} text Claude Code's status-line input */
function quotaMetadata(text) {
  const v = projectJSON(text, schema),
    windows = {};
  for (const key of ['five_hour', 'seven_day']) if (v.rate_limits?.[key] != null) windows[key] = v.rate_limits[key];
  return { version: v.version, sessionId: v.session_id, project: v.workspace?.current_dir, windows };
}
/**
 * The status-line text the helpers print: one line of at most 200 characters without control characters, else ''
 * (the helper then shows its plain marker, T12.7).
 * @param {unknown} value
 */
function safeLine(value) {
  const line = typeof value === 'string' ? value.slice(0, 200) : '';
  // eslint-disable-next-line no-control-regex -- control characters are matched on purpose (one-line output)
  return /[\u0000-\u001f\u007f]/.test(line) ? '' : line;
}
module.exports = { quotaMetadata, safeLine, schema };
