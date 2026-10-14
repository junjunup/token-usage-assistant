// Synthetic metadata for browser previews and isolated smoke tests only.
function sampleRows(now = Date.now()) {
  const rows = [],
    models = ['claude-sonnet-4.6', 'gpt-5.4', 'gemini-3.1-pro'],
    projects = ['C:/Demo/token-companion', 'C:/Demo/design-system', 'C:/Demo/notes'];
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  for (let day = 0; day < 40; day++)
    for (let i = 0; i < 28 + ((day * 13) % 34); i++) {
      const at = midnight.getTime() - day * 86400000 + ((i * 19) % 24) * 3600000 + ((i * 7) % 60) * 60000;
      if (at > now) continue;
      const input = 42000 + ((i * day * 137 + i * 913) % 87000),
        output = 800 + ((i * 151 + day * 239) % 7600),
        read = Math.floor(input * (0.48 + (i % 4) * 0.11)),
        write = i % 5 === 0 ? Math.floor(input * 0.07) : 0;
      rows.push({
        id: `demo-${day}-${i}`,
        session_id: `demo-session-${day}-${i % 5}`,
        started_at: at,
        model_id: models[i % 3],
        provider_id: '示例来源',
        directory: projects[i % 3],
        status: i % 37 === 0 ? 'error' : i % 43 === 0 ? 'cancelled' : 'completed',
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: read,
        cache_creation_input_tokens: write,
        computed_total_tokens: input + output,
      });
    }
  return rows;
}
function samplePrices() {
  return Object.fromEntries(
    ['claude-sonnet-4.6', 'gpt-5.4', 'gemini-3.1-pro'].map((name, i) => [
      JSON.stringify(['示例来源', name]),
      { input: 3 - i * 0.6, output: 15 - i * 3, read: 0.3 - i * 0.05, write: 3.75 - i * 0.5 },
    ]),
  );
}
module.exports = { sampleRows, samplePrices };
