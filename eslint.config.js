import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  ignores: ['dist', 'dev-dist', 'android'],
}, {
  // Node scripts (tools/*.mjs).
  files: ['tools/**/*.mjs'],
  languageOptions: { globals: { URL: 'readonly', console: 'readonly', process: 'readonly' } },
}, {
  // Phase II starts only from the `Legacy` phase I hands over: it never imports phase I's code (src/saves.ts is the one
  // module that knows both phases' saves).
  files: ['src/phase2/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/phase1/**', '**/phase1'], message: 'Phase II must not import phase I: use the Legacy it hands over.' }] }] },
}, {
  // Shared code knows neither phase.
  files: ['src/shared/**', 'src/platform/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['**/phase1/**', '**/phase2/**'], message: 'Shared code must not import either phase.' }] }] },
});
