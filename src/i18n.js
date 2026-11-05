// T14.4 (D21 ④): interface language. Source strings stay Chinese in the code; t() returns the English text when the
// interface is English and a translation exists, otherwise the Chinese original (untranslated text is never machine
// translated). The language is the setting (`language`: system / zh / en), and for "system" the system's preferred
// language: any Chinese locale reads Chinese, everything else English.
import { EN, EN_PATTERNS } from './i18n-en.js';

let current = 'zh';

/**
 * @param {string} setting 'system' | 'zh' | 'en'
 * @param {string|null|undefined} system the system's preferred language (e.g. 'zh-Hans-CN', 'en-US')
 * @returns {'zh'|'en'}
 */
export function resolveLanguage(setting, system) {
  if (setting === 'zh' || setting === 'en') return setting;
  return typeof system === 'string' && system && !/^zh\b/i.test(system) ? 'en' : 'zh';
}
export function setLanguage(language) {
  current = language === 'en' ? 'en' : 'zh';
  if (typeof document !== 'undefined') document.documentElement.lang = current === 'en' ? 'en' : 'zh-CN';
}
export const language = () => current;
export const isEnglish = () => current === 'en';
/** Locale for numbers and dates. */
export const locale = () => (current === 'en' ? 'en-US' : 'zh-CN');

const fill = (text, vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (all, key) => (Object.hasOwn(vars, key) ? String(vars[key]) : all)) : text;

/**
 * @param {string} text the Chinese source; may hold {name} placeholders filled from vars
 * @param {Record<string, any>} [vars]
 */
export function t(text, vars) {
  if (current !== 'en' || typeof text !== 'string') return fill(text, vars);
  if (Object.hasOwn(EN, text)) return fill(EN[text], vars);
  // Pieces joined with other text keep their surrounding spaces ("剩余 " + value): look the core up.
  const core = text.trim();
  if (core !== text && Object.hasOwn(EN, core)) {
    const lead = /^\s/.test(text) ? ' ' : '',
      trail = /\s$/.test(text) ? ' ' : '';
    return lead + fill(EN[core], vars) + trail;
  }
  // Text built elsewhere (e.g. the shared domain modules: "2 天 3 小时后重置"), translated by pattern.
  const filled = fill(text, vars);
  if (Object.hasOwn(EN, filled)) return EN[filled];
  for (const [pattern, replace] of EN_PATTERNS) {
    const m = pattern.exec(filled);
    if (m) return typeof replace === 'function' ? replace(...m.slice(1)) : filled.replace(pattern, replace);
  }
  // Labels joined with " · " (e.g. "成员预算 · 每周"): each part on its own; untranslated parts stay as they are.
  if (filled.includes(' · ')) {
    const parts = filled.split(' · '),
      done = parts.map((part) => t(part));
    if (done.some((part, i) => part !== parts[i])) return done.join(' · ');
  }
  return filled;
}
