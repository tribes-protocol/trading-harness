import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

/**
 * The only file in the gateway that reads process.env. Every other module
 * imports the resolved constant.
 */

const NODE_ENV = process.env.NODE_ENV
const IS_PRODUCTION = NODE_ENV === 'production'

const DEFAULT_GATEWAY_PORT = 4100
const LOOPBACK_HOST = '127.0.0.1'
const MAX_TCP_PORT = 65535

const PortSchema = z.coerce.number().int().positive().max(MAX_TCP_PORT)

const parsedPort = PortSchema.safeParse(process.env.GATEWAY_PORT)

export const GATEWAY_PORT = parsedPort.success ? parsedPort.data : DEFAULT_GATEWAY_PORT

/**
 * A gateway screen is a Pi agent with shell access to this checkout, so a dev
 * server that binds every interface hands that shell to the local network.
 * Loopback is the default and the only option outside production; production
 * may name an interface explicitly, and never gets the 0.0.0.0 wildcard by
 * default.
 */
const HOST_OVERRIDE = process.env.GATEWAY_HOST

export const GATEWAY_HOST =
  IS_PRODUCTION && HOST_OVERRIDE !== undefined && HOST_OVERRIDE.length > 0
    ? HOST_OVERRIDE
    : LOOPBACK_HOST

/**
 * Origins allowed to open a screen socket.
 *
 * Binding to loopback is NOT a mitigation against a browser: WebSocket handshakes
 * are exempt from the same-origin policy, so any page the user happens to visit
 * can open `ws://127.0.0.1:4100/ws` and drive an agent that has bash and write
 * tools rooted at this checkout. Browsers always send `Origin` on the handshake,
 * which makes an allowlist the correct — and sufficient — defence against that
 * drive-by. It deliberately does not try to authenticate non-browser clients:
 * they can forge any header, so the header is not where that boundary lives.
 *
 * The default is tribes-terminal's dev server, because that is where the UI lives:
 * apps/web serves /sandbox/chat on :3000. (It used to be :3100, this repo's own web
 * app, which moved out — leaving a default that rejected the only client there is.)
 * This matters ONLY in dev mode; in owner mode the origin is not consulted at all,
 * since the real one is https://pi.<slug>.<domain> and unknowable at boot.
 */
const DEFAULT_ALLOWED_ORIGINS = ['http://127.0.0.1:3000', 'http://localhost:3000'] as const

const ORIGINS_OVERRIDE = process.env.GATEWAY_ALLOWED_ORIGINS

export const GATEWAY_ALLOWED_ORIGINS: readonly string[] =
  ORIGINS_OVERRIDE === undefined || ORIGINS_OVERRIDE.length === 0
    ? DEFAULT_ALLOWED_ORIGINS
    : ORIGINS_OVERRIDE.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)

/**
 * Owner-signature auth for the screen socket (see types/OwnerAuth).
 *
 * Inside a VM the `pi.<slug>.<domain>` front is a bare `reverse_proxy` with no
 * `forward_auth`, so it is publicly reachable and the gateway must authenticate
 * every upgrade itself.
 *
 * These are the RAW strings only. The mode is DECLARED by `GATEWAY_AUTH_MODE` and
 * defaults to `owner`; `utils/GatewayAuthConfig` validates the combination and Main
 * exits on a bad one. Whether an address happens to be present deliberately does
 * NOT select the mode — inferring it that way means a VM that boots without the
 * variable serves unauthenticated.
 */
const AUTH_MODE_ENV = process.env.GATEWAY_AUTH_MODE

export const GATEWAY_AUTH_MODE_RAW = AUTH_MODE_ENV === undefined ? '' : AUTH_MODE_ENV.trim()

const OWNER_ADDRESS_ENV = process.env.TRIBES_OWNER_ADDRESS

export const TRIBES_OWNER_ADDRESS = OWNER_ADDRESS_ENV === undefined ? '' : OWNER_ADDRESS_ENV.trim()

const SANDBOX_ID_ENV = process.env.TRIBES_SANDBOX_ID

export const TRIBES_SANDBOX_ID = SANDBOX_ID_ENV === undefined ? '' : SANDBOX_ID_ENV.trim()

// src/common -> src -> apps/gateway -> apps -> repo root. Pi resolves project
// resources at join(cwd, '.pi') with no ancestor walk, so the screen's cwd has
// to be the repo root itself, not the app directory.
const GATEWAY_COMMON_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(GATEWAY_COMMON_DIR, '..', '..', '..', '..')

export const PI_SCREEN_CWD = process.env.PI_SCREEN_CWD ?? REPO_ROOT

/**
 * Session JSONL files have no cross-process lock and SessionManager rewrites the
 * whole file from its in-memory array. A `pi` CLI is normally already running in
 * this same cwd, so sharing its session directory would silently truncate that
 * agent's history. The gateway always gets its own directory.
 */
export const PI_SCREEN_SESSION_DIR =
  process.env.PI_SCREEN_SESSION_DIR ?? join(PI_SCREEN_CWD, 'runtime', 'gateway-sessions')
