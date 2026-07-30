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
 */
const DEFAULT_ALLOWED_ORIGINS = ['http://127.0.0.1:3100', 'http://localhost:3100'] as const

const ORIGINS_OVERRIDE = process.env.GATEWAY_ALLOWED_ORIGINS

export const GATEWAY_ALLOWED_ORIGINS: readonly string[] =
  ORIGINS_OVERRIDE === undefined || ORIGINS_OVERRIDE.length === 0
    ? DEFAULT_ALLOWED_ORIGINS
    : ORIGINS_OVERRIDE.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)

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
