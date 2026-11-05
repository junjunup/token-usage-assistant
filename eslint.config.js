import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'release-*/', 'src/generated/', 'work/', 'docs/', '.claude/'] },
  js.configs.recommended,
  {
    rules: {
      'no-empty': 'warn',
      'no-unused-vars': 'warn',
    },
  },
  {
    files: ['desktop/**/*.cjs', 'scripts/**/*.cjs', 'tests/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['scripts/**/*.mjs', 'vite.config.mjs', 'eslint.config.js', 'integrations/**/*.js'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  {
    // The Harness plugin is installed by users as shipped (exporter 1.5.0). Its empty catch blocks are deliberate:
    // errors map to fixed codes and raw causes are never kept. Allowed here instead of editing the shipped files.
    files: ['integrations/**/*.js'],
    rules: { 'no-empty': ['warn', { allowEmptyCatch: true }] },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    ...reactHooks.configs.flat.recommended,
  },
];
