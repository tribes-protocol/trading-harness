// The API/WEB base URLs and the Privy app id all default to PRODUCTION, and a
// NODE_ENV value never changes that. Production is the correct default for any
// build, and a stray NODE_ENV=development in a .env must not silently redirect
// login/API onto localhost. The only way to point elsewhere is an explicit
// API_BASE_URL / WEB_BASE_URL / PRIVY_APP_ID in the environment (a sandbox boot
// env injects the control-plane base this way; local dev sets it in .env).
export const API_BASE_URL = process.env.API_BASE_URL ?? 'https://api.tribes.xyz'
export const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'https://tribes.xyz'

// The bearer for every proxy call is the ES256 JWT the harness mints from the
// in-VM P-256 agent key; the tribes extension (and `tribes-cli login`) persist it
// to .env as API_BEARER_TOKEN, which the compiled CLI auto-loads.
export const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN ?? ''

// Defaults to the production Privy app id. It is signed: the CLI signs its Privy
// authorization payload over the `privy-app-id` header (utils/PrivySignature.ts),
// so when an override is needed it MUST be the app the control plane sends, not
// one derived from NODE_ENV. An explicit PRIVY_APP_ID in the environment wins;
// otherwise the production app id applies.
export const PRIVY_APP_ID = process.env.PRIVY_APP_ID ?? 'cmiwpjw6y0001l80b2er4lqzu'

// Direct-provider keys. Each name matches the control plane's egress billing
// entry for its catalog id: inside a sandbox the boot env carries a
// placeholder under the name and the egress proxy swaps in the real key, so
// this process never holds a live credential. Empty string = provider not
// configured; the dependent command group reports itself unavailable.
export const COIN_GECKO_PRO_API_KEY = process.env.COIN_GECKO_PRO_API_KEY ?? ''
export const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY ?? ''
export const NANSEN_API_KEY = process.env.NANSEN_API_KEY ?? ''
export const MARKETSTACK_API_KEY = process.env.MARKETSTACK_API_KEY ?? ''
