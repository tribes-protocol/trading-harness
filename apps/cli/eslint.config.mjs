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

export default [
  { ignores: sharedIgnores },
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
    plugins: sharedPlugins,
    rules: { ...sharedTypeScriptRules, ...LUCY_RULES }
  }
]
