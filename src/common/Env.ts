import { ensureString } from '@/utils/Lang'

const NODE_ENV = process.env.NODE_ENV
const USE_DEFAULT_VALUES = NODE_ENV === undefined || NODE_ENV === ''
const IS_PRODUCTION = NODE_ENV === 'production' || USE_DEFAULT_VALUES

// An explicit API_BASE_URL / WEB_BASE_URL in the environment wins over the
// NODE_ENV default. In a sandbox the boot env injects the control-plane base
// this way, and local dev sets it in .env to point at localhost — either must
// be honored, not silently overridden by the production ternary.
export const API_BASE_URL =
  process.env.API_BASE_URL ?? (IS_PRODUCTION ? 'https://api.tribes.xyz' : 'http://localhost:8787')
export const WEB_BASE_URL =
  process.env.WEB_BASE_URL ?? (IS_PRODUCTION ? 'https://tribes.xyz' : 'http://localhost:3000')

// The bearer for every proxy call is the ES256 JWT the harness mints from the
// in-VM P-256 agent key; the tribes extension (and `tribes-cli login`) persist it
// to .env as API_BEARER_TOKEN, which the compiled CLI auto-loads.
export const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN ?? ''

// An explicit PRIVY_APP_ID in the environment wins over the NODE_ENV default, for
// exactly the same reason API_BASE_URL above does — and it MUST, because this value
// is signed. The CLI signs its Privy authorization payload over the `privy-app-id`
// header (utils/PrivySignature.ts), so this has to be the app the CONTROL PLANE
// sends, not whichever one the build defaulted to.
//
// In a sandbox NODE_ENV is unset, so IS_PRODUCTION is true (see USE_DEFAULT_VALUES),
// and the production ternary discarded the app id the boot env injects. The guest
// then signed with the production app while apps/api sent its own, so the payloads
// differed and Privy rejected every signature with "No valid authorization
// signatures were provided" — a 500 on every sendEthTransaction, with nothing in
// the message pointing at the app id. Observed 2026-07-29: boot env injected
// cmecbhzhh0147jm0cdbs4jx9l, the CLI resolved cmiwpjw6y0001l80b2er4lqzu.
export const PRIVY_APP_ID =
  process.env.PRIVY_APP_ID ??
  (IS_PRODUCTION
    ? 'cmiwpjw6y0001l80b2er4lqzu'
    : ensureString(
        process.env.PRIVY_APP_ID,
        'PRIVY_APP_ID is not set. A development build (NODE_ENV=development) targets ' +
          'localhost and needs your local Privy app id. Add PRIVY_APP_ID=<id> to .env, ' +
          'then rebuild with `bun run setup:dev`. To use the production backend instead, ' +
          'run `bun run setup:prod` (the default for a fresh clone).'
      ))

// Direct-provider keys. Each name matches the control plane's egress billing
// entry for its catalog id: inside a sandbox the boot env carries a
// placeholder under the name and the egress proxy swaps in the real key, so
// this process never holds a live credential. Empty string = provider not
// configured; the dependent command group reports itself unavailable.
export const COIN_GECKO_PRO_API_KEY = process.env.COIN_GECKO_PRO_API_KEY ?? ''
export const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY ?? ''
export const NANSEN_API_KEY = process.env.NANSEN_API_KEY ?? ''
export const MARKETSTACK_API_KEY = process.env.MARKETSTACK_API_KEY ?? ''
