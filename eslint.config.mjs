/**
 * ESLint config for the trading-harness (standalone).
 *
 * Self-contained: the shared TypeScript rules and the custom `lucy/*` rules that
 * were imported from the monorepo are vendored here (./eslint-rules). No rules
 * were dropped in the move — monorepo-app-specific rules that cannot apply to a
 * Pi harness (e.g. resolved-api-url, core-layer-boundaries) simply were never in
 * this harness's set.
 */
import js from '@eslint/js'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import importPlugin from 'eslint-plugin-import'
import prettierPlugin from 'eslint-plugin-prettier'
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort'
import unusedImportsPlugin from 'eslint-plugin-unused-imports'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import lucyPlugin from './eslint-rules/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const prettierConfig = {
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  bracketSpacing: true,
  jsxSingleQuote: false,
  tabWidth: 2,
  printWidth: 100,
  useTabs: false
}

const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  globalThis: 'readonly'
}

const sharedTypeScriptRules = {
  'import/no-duplicates': 'error',
  'simple-import-sort/imports': 'error',
  'simple-import-sort/exports': 'error',
  'unused-imports/no-unused-imports': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'viem',
          importNames: ['zeroAddress'],
          message:
            'Do not import zeroAddress from viem. Define a local ZERO_ADDRESS constant instead.'
        }
      ]
    }
  ],
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-inferrable-types': ['error', { ignoreParameters: true, ignoreProperties: true }],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/explicit-function-return-type': [
    'error',
    {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
      allowDirectConstAssertionInArrowFunctions: true,
      allowConciseArrowFunctionExpressionsStartingWithVoid: true
    }
  ],
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-useless-constructor': ['error'],
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  'no-unused-vars': 'off',
  'no-unused-private-class-members': 'off',
  '@typescript-eslint/no-unused-private-class-members': 'error',
  'no-void': 'off',
  'max-len': ['error', { code: 100, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreComments: true }],
  eqeqeq: ['error', 'always'],
  radix: ['error', 'as-needed'],
  'object-shorthand': ['error', 'always'],
  'no-useless-constructor': 'off',
  'no-async-promise-executor': 'off',
  indent: 'off',
  '@typescript-eslint/indent': 'off',
  'prettier/prettier': ['error', prettierConfig]
}

const LUCY_RULES = {
  'lucy/no-json-stringify': 'error',
  'lucy/no-pass-through-alias-export': 'error',
  'lucy/no-barrel-re-export': 'error',
  'lucy/no-generic-filenames': 'error',
  'lucy/no-indexed-type-access': 'error',
  'lucy/no-inline-zod-infer': 'error',
  'lucy/no-optional-nullable': 'error',
  'lucy/no-raw-zod-bigint': 'error',
  'lucy/require-eslint-disable-explanation': 'error',
  'lucy/enforce-url-constructor-two-args': 'error',
  'lucy/no-empty-file': 'error',
  'lucy/no-v8-ignore': 'error'
}

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-test/**',
      '**/coverage/**',
      'runtime/**',
      'eslint-rules/**',
      '**/*.d.ts',
      '**/test/**',
      'tests/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
      globals: NODE_GLOBALS
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      import: importPlugin,
      prettier: prettierPlugin,
      'simple-import-sort': simpleImportSortPlugin,
      'unused-imports': unusedImportsPlugin,
      lucy: lucyPlugin
    },
    rules: { ...sharedTypeScriptRules, ...LUCY_RULES }
  }
]
