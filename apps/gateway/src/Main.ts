import { randomUUID } from 'node:crypto'

import { SCREEN_SOCKET_PATH } from '@tribes-harness/protocol/common/Constants'

import { GATEWAY_ALLOWED_ORIGINS, GATEWAY_HOST, GATEWAY_PORT } from '@/common/Env'
import { HEALTH_PATH } from '@/common/GatewayLimits'
import { SCREEN_CONFIGS } from '@/common/ScreenCatalog'
import { ScreenSocketController } from '@/controllers/ScreenSocketController'
import { ScreenRegistryService } from '@/services/ScreenRegistryService'
import type { ScreenSocketData } from '@/types/Screen'
import { logError, logInfo, logWarn } from '@/utils/Logger'
import { isOriginAllowed } from '@/utils/OriginPolicy'

const registry = new ScreenRegistryService(SCREEN_CONFIGS)
const controller = new ScreenSocketController(registry)

const server = Bun.serve<ScreenSocketData>({
  port: GATEWAY_PORT,
  hostname: GATEWAY_HOST,
  fetch: (request, bunServer) => {
    const url = new URL(request.url)

    if (url.pathname === HEALTH_PATH) {
      return new Response('ok')
    }

    if (url.pathname === SCREEN_SOCKET_PATH) {
      // Loopback does not protect this socket from a browser — WebSocket
      // handshakes skip the same-origin policy, so any page the user has open
      // could otherwise drive an agent holding bash and write over this repo.
      if (!isOriginAllowed(request.headers.get('origin'), GATEWAY_ALLOWED_ORIGINS)) {
        logWarn(`rejected a screen socket from origin ${request.headers.get('origin') ?? '(none)'}`)
        return new Response('origin not allowed', { status: 403 })
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
