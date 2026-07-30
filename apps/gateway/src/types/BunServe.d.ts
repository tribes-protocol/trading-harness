/**
 * Minimal ambient declaration for the slice of `Bun.serve` the gateway uses.
 *
 * Same precedent as terminal's apps/microvmd/src/bun-serve.d.ts: the program is
 * typed as a node program (`types: ["node"]`), and pulling in bun-types clashes
 * with the @types/node globals, so the used surface is declared by hand.
 *
 * `send` is deliberately declared as returning `number`: Bun answers with the
 * byte count, 0 when the message was dropped, and -1 when it was buffered
 * because the socket is saturated. The gateway checks for -1 to start dropping
 * deltas instead of growing an unbounded queue, so the return value must not be
 * typed away as void.
 */
declare global {
  interface BunServerWebSocket<TData> {
    readonly data: TData
    readonly readyState: number
    send(message: string, compress?: boolean): number
    close(code?: number, reason?: string): void
  }

  interface BunWebSocketHandler<TData> {
    open?: (ws: BunServerWebSocket<TData>) => void | Promise<void>
    message: (ws: BunServerWebSocket<TData>, message: string | Uint8Array) => void | Promise<void>
    close?: (ws: BunServerWebSocket<TData>, code: number, reason: string) => void | Promise<void>
    drain?: (ws: BunServerWebSocket<TData>) => void | Promise<void>
  }

  interface BunUpgradeOptions<TData> {
    data: TData
  }

  interface BunServer<TData> {
    upgrade(request: Request, options?: BunUpgradeOptions<TData>): boolean
    stop(closeActiveConnections?: boolean): void
  }

  interface BunServeOptions<TData> {
    port: number
    hostname: string
    // `undefined` is how a handler says "upgraded, no HTTP response". The screen
    // socket awaits owner-signature verification before upgrading, so the async
    // form has to be allowed to resolve to undefined too.
    fetch: (
      request: Request,
      server: BunServer<TData>
    ) => Response | Promise<Response | undefined> | undefined
    websocket: BunWebSocketHandler<TData>
  }

  const Bun: {
    serve<TData>(options: BunServeOptions<TData>): BunServer<TData>
  }
}

export {}
