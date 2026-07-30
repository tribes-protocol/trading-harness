/**
 * Root ESLint config for the trading-harness monorepo.
 *
 * Two jobs, deliberately in one file:
 *
 *  1. **Fragments library.** Every workspace imports `sharedTypeScriptRules`,
 *     `sharedIgnores`, `LUCY_RULES`, `NODE_GLOBALS`, `sharedPlugins` and
 *     `prettierConfig` from here by relative path, exactly the way terminal's
 *     packages do. There is no published shared-config package — depth-correct
 *     relative imports are the whole mechanism.
 *
 *  2. **A real config for the root-owned Pi surface.** `.pi/extensions/**` is
 *     source that lives at the repo root and belongs to no workspace, because Pi
 *     discovers project extensions at `join(cwd, '.pi', 'extensions')` with no
 *     ancestor walk. Terminal's root config is a throwing Proxy ("lint per-package")
 *     — it can afford that because everything there lives in a workspace. Here the
 *     default export lints `.pi/` so that surface keeps its coverage.
 *
 * The shared TypeScript rules and the custom `lucy/*` rules are vendored in
 * ./eslint-rules. Nothing was dropped in the monorepo move.
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

export const prettierConfig = {
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  bracketSpacing: true,
  jsxSingleQuote: false,
  tabWidth: 2,
  printWidth: 100,
  useTabs: false
}

export const NODE_GLOBALS = {
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

export const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  WebSocket: 'readonly',
  CloseEvent: 'readonly',
  MessageEvent: 'readonly',
  Event: 'readonly',
  KeyboardEvent: 'readonly',
  HTMLElement: 'readonly',
  HTMLDivElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  ResizeObserver: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly'
}

export const sharedTypeScriptRules = {
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
  '@typescript-eslint/no-inferrable-types': [
    'error',
    { ignoreParameters: true, ignoreProperties: true }
  ],
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
  '@typescript-eslint/no-unused-vars': [
    'error',
    { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }
  ],
  '@typescript-eslint/no-useless-constructor': ['error'],
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  'no-unused-vars': 'off',
  'no-unused-private-class-members': 'off',
  '@typescript-eslint/no-unused-private-class-members': 'error',
  'no-void': 'off',
  'max-len': [
    'error',
    { code: 100, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreComments: true }
  ],
  eqeqeq: ['error', 'always'],
  radix: ['error', 'as-needed'],
  'object-shorthand': ['error', 'always'],
  'no-useless-constructor': 'off',
  'no-async-promise-executor': 'off',
  indent: 'off',
  '@typescript-eslint/indent': 'off',
  'prettier/prettier': ['error', prettierConfig]
}

export const LUCY_RULES = {
  'lucy/no-json-stringify': 'error',
  'lucy/no-pass-through-alias-export': 'error',
  'lucy/no-barrel-re-export': 'error',
  'lucy/no-generic-filenames': 'error',
  'lucy/pascalcase-filename': 'error',
  'lucy/no-indexed-type-access': 'error',
  'lucy/no-inline-zod-infer': 'error',
  'lucy/no-optional-nullable': 'error',
  'lucy/no-raw-zod-bigint': 'error',
  'lucy/require-eslint-disable-explanation': 'error',
  'lucy/enforce-url-constructor-two-args': 'error',
  'lucy/no-empty-file': 'error',
  'lucy/no-v8-ignore': 'error'
}

export const sharedIgnores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/dist-test/**',
  '**/coverage/**',
  '**/.next/**',
  'runtime/**',
  'eslint-rules/**',
  'scripts/*.mjs',
  '**/*.d.ts',
  '**/test/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/vitest.config.ts'
]

export const sharedPlugins = {
  '@typescript-eslint': typescriptEslint,
  import: importPlugin,
  prettier: prettierPlugin,
  'simple-import-sort': simpleImportSortPlugin,
  'unused-imports': unusedImportsPlugin,
  lucy: lucyPlugin
}

export default [
  { ignores: [...sharedIgnores, 'apps/**', 'packages/**'] },
  js.configs.recommended,
  {
    files: ['.pi/**/*.ts', '.pi/**/*.mts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
      globals: NODE_GLOBALS
    },
    plugins: sharedPlugins,
    rules: { ...sharedTypeScriptRules, ...LUCY_RULES }
  }
]
