import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @tribes-harness/protocol ships raw TypeScript (its `exports` map points at
  // src/*.ts), so Next has to run it through the app's compiler pipeline.
  transpilePackages: ['@tribes-harness/protocol'],
  poweredByHeader: false,
  devIndicators: false,
  // The workspace runs a dedicated Lint task over every package; re-running ESLint
  // inside `next build` is duplicated work.
  eslint: { ignoreDuringBuilds: true }
}

export default nextConfig
