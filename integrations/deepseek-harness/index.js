import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { UsageExporter, HARNESS_VERSION, VERIFIED_RUNTIMES } from './exporter.js';

export const name = 'token-usage-assistant';
export const inject = ['sessions'];

/** Post-commit observer only: no tool/provider hooks, histories or message reads. */
export function apply(ctx, config = {}) {
  const outputDirectory = typeof config.outputDirectory === 'string' && config.outputDirectory
    ? config.outputDirectory : join(homedir(), '.token-usage-assistant', 'harness');
  let runtimeVersion = null;
  try { runtimeVersion = createRequire(import.meta.url)('@deepseek-ai/dsh-session/package.json').version; } catch {}
  const exporter = new UsageExporter({ outputDirectory, runtimeVersion });
  if (Object.keys(config).some(key => key !== 'outputDirectory')) exporter.disable('unsupported-config');
  // Never propagate observer or disk failures to the model/tool process.
  ctx.on('session/event', (session, event) => { exporter.observe(session, event); });
  ctx.effect(() => () => exporter.close());
}

export { HARNESS_VERSION, VERIFIED_RUNTIMES };
