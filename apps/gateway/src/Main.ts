import { randomUUID } from 'node:crypto'

import { SCREEN_SOCKET_PATH } from '@tribes-harness/protocol/common/Constants'

import {
  GATEWAY_ALLOWED_ORIGINS,
  GATEWAY_AUTH_MODE_RAW,
  GATEWAY_HOST,
  GATEWAY_PORT,
  TRIBES_OWNER_ADDRESS,
  TRIBES_SANDBOX_ID
} from '@/common/Env'
import { HEALTH_PATH } from '@/common/GatewayLimits'
import { SCREEN_CONFIGS } from '@/common/ScreenCatalog'
import { ScreenSocketController } from '@/controllers/ScreenSocketController'
import { verifyOwnerSignature } from '@/helpers/OwnerSignature'
import { describeScreenWorkspace } from '@/helpers/ScreenWorkspace'
import { ScreenRegistryService } from '@/services/ScreenRegistryService'
import type { GatewayAuthConfig, OwnerAuthResult } from '@/types/OwnerAuth'
import type { ScreenSocketData } from '@/types/Screen'
import { resolveGatewayAuthConfig } from '@/utils/GatewayAuthConfig'
import { logError, logInfo, logWarn } from '@/utils/Logger'
import { isOriginAllowed } from '@/utils/OriginPolicy'
import { checkSandboxChallenge } from '@/utils/SandboxChallenge'
import { decideUpgrade } from '@/utils/UpgradePolicy'

const registry = new ScreenRegistryService(SCREEN_CONFIGS)
const controller = new ScreenSocketController(registry)

// Resolve the auth boundary BEFORE binding a port. A misconfigured owner mode is a
// startup failure, never a downgrade to something weaker: this process may sit
// behind a public front with no forward_auth in front of it.
const authResolution = resolveGatewayAuthConfig({
  mode: GATEWAY_AUTH_MODE_RAW,
  ownerAddress: TRIBES_OWNER_ADDRESS,
  sandboxId: TRIBES_SANDBOX_ID
})
if (!authResolution.ok) {
  logWarn(`refusing to start: ${authResolution.error}`)
  process.exit(1)
}
const AUTH = authResolution.config

/**
 * Verify the owner's signed challenge off the ws URL. A WebSocket handshake cannot
 * carry custom headers, so the pair rides `?message=&signature=` exactly as
 * microvmd's terminal socket takes it — one challenge signed once serves both.
 *
 * The address compared against comes from the resolved config; nothing the request
 * supplies can stand in for it.
 */
async function authenticateOwner(url: URL, auth: GatewayAuthConfig): Promise<OwnerAuthResult> {
  if (auth.mode !== 'owner') {
    return { authorized: false, reason: 'sandbox-not-configured' }
  }
  const message = url.searchParams.get('message') ?? ''
  const signature = url.searchParams.get('signature') ?? ''
  if (message.length === 0 || signature.length === 0) {
    return { authorized: false, reason: 'no-credentials' }
  }
  const check = checkSandboxChallenge({
    message,
    sandboxId: auth.sandboxId,
    nowMs: Date.now()
  })
  if (!check.valid) {
    return { authorized: false, reason: check.reason }
  }
  const verified = await verifyOwnerSignature({
    message,
    signature,
    ownerAddress: auth.ownerAddress
  })
  return verified ? { authorized: true } : { authorized: false, reason: 'signature-not-owner' }
}

const server = Bun.serve<ScreenSocketData>({
  port: GATEWAY_PORT,
  hostname: GATEWAY_HOST,
  fetch: async (request, bunServer) => {
    const url = new URL(request.url)

    if (url.pathname === HEALTH_PATH) {
      return new Response('ok')
    }

    if (url.pathname === SCREEN_SOCKET_PATH) {
      // Loopback does not protect this socket from a browser — WebSocket
      // handshakes skip the same-origin policy, so any page the user has open
      // could otherwise drive an agent holding bash and write over this repo.
      // Inside a VM the front is public, so the origin check is not the boundary
      // at all: the owner signature is.
      const decision = decideUpgrade({
        auth: AUTH,
        ownerAuth: AUTH.mode === 'owner' ? await authenticateOwner(url, AUTH) : null,
        originAllowed: isOriginAllowed(request.headers.get('origin'), GATEWAY_ALLOWED_ORIGINS)
      })
      if (!decision.allowed) {
        logWarn(
          `rejected a screen socket upgrade (${decision.reason}) from origin ` +
            `${request.headers.get('origin') ?? '(none)'}`
        )
        // The reason stays in the log: the client learns only that it was refused.
        return new Response(null, { status: decision.status })
      }
      const upgraded = bunServer.upgrade(request, { data: { socketId: randomUUID() } })
      return upgraded ? undefined : new Response('expected a websocket upgrade', { status: 400 })
    }

    return new Response('not found', { status: 404 })
  },
  websocket: {
    open: (socket) => {
      controller.handleOpen(socket)
    },
    message: async (socket, message) => {
      await controller.handleMessage(socket, message)
    },
    close: (socket) => {
      controller.handleClose(socket)
    },
    drain: (socket) => {
      controller.handleDrain(socket)
    }
  }
})

logInfo(`gateway listening on ws://${GATEWAY_HOST}:${GATEWAY_PORT}${SCREEN_SOCKET_PATH}`)

// Say out loud what the agent will actually have. Pi discovers extensions, skills
// and the operating prompt from cwd and stays silent when they are absent, so a
// screen pointed at the wrong directory looks identical to one whose skills failed
// to load.
for (const screen of SCREEN_CONFIGS) {
  const missing = describeScreenWorkspace(screen.cwd)
  if (missing.length > 0) {
    logWarn(
      `screen "${screen.screenId}" has no Pi project surface in its working directory — ` +
        `missing ${missing.join(', ')}. It will run as a bare Pi: no harness skills, ` +
        'no tribes extensions, and the default model rather than the pinned one.'
    )
  } else {
    logInfo(`screen "${screen.screenId}" loaded the Pi project surface from its workspace`)
  }
}

switch (AUTH.mode) {
  case 'owner': {
    logInfo(`screen socket requires an owner signature for sandbox ${AUTH.sandboxId}`)
    break
  }
  case 'dev': {
    logWarn(
      'GATEWAY_AUTH_MODE=dev: the screen socket is UNAUTHENTICATED (origin allowlist only). ' +
        'Do not expose this gateway beyond loopback — the socket drives an agent with bash and write.'
    )
    break
  }
}

let shuttingDown = false

function shutdown(signal: string): void {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  logInfo(`received ${signal}, disposing screens`)
  try {
    server.stop(true)
    registry.disposeAll()
  } catch (error) {
    logError('shutdown failed', error)
  }
  process.exit(0)
}

process.on('SIGINT', () => {
  shutdown('SIGINT')
})
process.on('SIGTERM', () => {
  shutdown('SIGTERM')
})
