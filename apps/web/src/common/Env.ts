import { SCREEN_SOCKET_PATH } from '@tribes-harness/protocol/common/Constants'

/**
 * The only file in this app that reads `process.env`. Everything else imports the
 * resolved constant.
 *
 * `NEXT_PUBLIC_*` is inlined by Next at build time, so this evaluates to a string
 * literal in the browser bundle — there is no `process` at runtime.
 */

const DEFAULT_GATEWAY_ORIGIN = 'ws://127.0.0.1:4100'

/**
 * The path comes from the protocol package, never from a literal here. A local
 * copy that drifts from the gateway's route leaves the tab stuck on
 * "reconnecting" with nothing in either log: the server never sees a request on
 * a path it serves, so it has nothing to report.
 */
export const GATEWAY_WS_URL =
  process.env.NEXT_PUBLIC_GATEWAY_WS_URL ?? `${DEFAULT_GATEWAY_ORIGIN}${SCREEN_SOCKET_PATH}`
