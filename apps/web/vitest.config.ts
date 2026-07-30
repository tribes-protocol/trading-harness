import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Picks up the two-root `@/*` mapping in tsconfig.json, which the protocol
    // package's internal imports depend on.
    tsconfigPaths: true
  },
  // tsconfig sets `jsx: preserve` (required by Next), which leaves JSX untransformed
  // for Vitest's transform. Override the runtime so .tsx sources parse under test.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react'
    }
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**']
    }
  }
})
