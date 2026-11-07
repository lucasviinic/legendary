import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Pacotes que cada área pode importar, conforme a direção de dependências da especificação. */
const packageRule = (message, ...group) => ({
  'no-restricted-imports': ['error', { patterns: [{ group, message }] }],
});

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.output/**',
      '**/.wxt/**',
      'design/**',
      'packages/db/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { import: importX },
    languageOptions: { globals: { ...globals.node } },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import/no-restricted-paths': [
        'error',
        {
          basePath: import.meta.dirname,
          zones: [
            {
              target: './packages',
              from: './apps',
              message: 'Nenhum pacote importa de um app.',
            },
            {
              target: './packages/core',
              from: './packages/db',
              message: 'core depende só de contracts.',
            },
            {
              target: './packages/db',
              from: './packages/core',
              message: 'db depende só de contracts.',
            },
            {
              target: './packages/contracts',
              from: ['./packages/core', './packages/db'],
              message: 'contracts não depende de outros pacotes.',
            },
            {
              target: './apps/desktop/src/renderer',
              from: './apps/desktop/src/main',
              message: 'O renderer fala com o main só pelo preload.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/**'],
    rules: packageRule(
      'core depende só de contracts.',
      '@legendary/db',
      'electron',
      'better-sqlite3',
    ),
  },
  {
    files: ['packages/db/**'],
    rules: packageRule('db depende só de contracts.', '@legendary/core', 'electron'),
  },
  {
    files: ['packages/contracts/**'],
    rules: packageRule(
      'contracts não depende de outros pacotes.',
      '@legendary/core',
      '@legendary/db',
    ),
  },
  {
    files: ['apps/desktop/src/renderer/**'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...packageRule(
        'O renderer só exibe dados e usa o preload.',
        '@legendary/db',
        'better-sqlite3',
        'electron',
      ),
    },
  },
  {
    files: ['apps/extension/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions } },
  },
  prettier,
);
