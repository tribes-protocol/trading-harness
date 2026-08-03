/**
 * Who is allowed to open a screen socket.
 *
 * The threat is a drive-by: WebSocket handshakes are exempt from the same-origin
 * policy, so a page the user visits in another tab can connect to a loopback
 * gateway and drive a Pi agent that holds bash and write tools over this
 * checkout. A browser always sends `Origin` on the handshake, so an allowlist
 * closes that hole completely.
 *
 * A MISSING `Origin` is allowed on purpose. Only non-browser clients omit it
 * (curl, the CLI, tests), and any of them can forge whatever value they like —
 * so rejecting the absent case would block honest tools while stopping nobody.
 * The browser boundary is the one this function defends.
 */
export function isOriginAllowed(origin: string | null, allowed: readonly string[]): boolean {
  if (origin === null || origin.length === 0) {
    return true
  }
  return allowed.includes(origin)
}
