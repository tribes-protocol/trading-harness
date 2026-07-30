import js from '@eslint/js'
import typescriptParser from '@typescript-eslint/parser'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import {
  LUCY_RULES,
  NODE_GLOBALS,
  sharedIgnores,
  sharedPlugins,
  sharedTypeScriptRules
} from '../../eslint.config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The gateway runs on Bun and serves the fetch API. `Bun`, the fetch types and
// the hand-written `Bun.serve` surface are ambient here (see
// src/types/BunServe.d.ts), and ESLint does not read .d.ts files, so no-undef
// needs them spelled out.
const GATEWAY_GLOBALS = {
  ...NODE_GLOBALS,
  Bun: 'readonly',
  BunServer: 'readonly',
  BunServeOptions: 'readonly',
  BunServerWebSocket: 'readonly',
  BunUpgradeOptions: 'readonly',
  BunWebSocketHandler: 'readonly',
  Request: 'readonly',
  Response: 'readonly'
}

export default [
  { ignores: sharedIgnores },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
      globals: GATEWAY_GLOBALS
    },
    plugins: sharedPlugins,
    rules: { ...sharedTypeScriptRules, ...LUCY_RULES }
  }
]
