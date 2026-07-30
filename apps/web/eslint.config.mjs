import js from '@eslint/js'
import typescriptParser from '@typescript-eslint/parser'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

import {
  BROWSER_GLOBALS,
  LUCY_RULES,
  NODE_GLOBALS,
  sharedIgnores,
  sharedPlugins,
  sharedTypeScriptRules
} from '../../eslint.config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default [
  { ignores: [...sharedIgnores, '.next/**', 'next-env.d.ts'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: true }
      },
      globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS }
    },
    plugins: { ...sharedPlugins, react: reactPlugin, 'react-hooks': reactHooksPlugin },
    settings: { react: { version: 'detect' } },
    rules: {
      ...sharedTypeScriptRules,
      ...LUCY_RULES,
      // TypeScript already resolves every identifier, including the DOM lib types
      // referenced in type position, which core `no-undef` cannot see.
      'no-undef': 'off',
      // There is no lucy/no-console-usage rule in this repo, so the console ban is
      // enforced by core `no-console`; src/utils/Logger.ts is the single exemption.
      'no-console': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error'
    }
  },
  {
    // Next owns these filenames: the App Router loads `layout`/`page` by exact
    // lowercase path, and `next.config.ts` is discovered by name.
    files: ['src/app/**/*.tsx', 'src/app/**/*.ts', 'next.config.ts'],
    rules: { 'lucy/pascalcase-filename': 'off' }
  }
]
