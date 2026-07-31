import { PROTOCOL_VERSION } from '@tribes-harness/protocol/common/Constants'
import type { ClientFrame, ServerFrame } from '@tribes-harness/protocol/types/ScreenProtocol'
import { ClientFrameSchema } from '@tribes-harness/protocol/types/ScreenProtocol'

import {
  WEBSOCKET_OPEN,
  WEBSOCKET_SEND_DROPPED,
  WEBSOCKET_SEND_ENQUEUED
} from '@/common/GatewayLimits'
import type { ScreenRegistryService } from '@/services/ScreenRegistryService'
import type { ScreenSocket, ScreenSocketConnection } from '@/types/Screen'
import { toJsonText } from '@/utils/JsonText'
import { describeError, logError, logWarn } from '@/utils/Logger'

const textDecoder = new TextDecoder()

/**
 * The socket half of the protocol: parse every inbound frame, dispatch it to the
 * registry, serialize outbound frames, and decide what backpressure means.
 *
 * Backpressure policy: when Bun reports a saturated socket, `screen.event` frames
 * are DROPPED rather than queued — an unbounded outbound queue for one wedged tab
 * is worse than a gap.
 *
 * What makes that safe is the RECOVERY, not the frames being replaceable. It used
 * to be argued from "`tool_output` is a cumulative snapshot, so there is nothing
 * coherent to replay anyway". That stopped being true when `!` bash arrived: those
 * chunks carry `replace: false`, so a dropped one is genuinely lost data, not a
 * stale view of data that is coming again.
 *
 * The standing guarantee is instead: `seq` still advances for a dropped frame, so
 * the client sees a gap, re-attaches, and takes a fresh snapshot — and that
 * snapshot now includes in-flight `!` runs (`activeBashBlocks`), so the recovered
 * transcript contains the output the drop lost. Snapshot, state, commands, models
 * and error frames are never dropped: they ARE the recovery path.
 */
export class ScreenSocketController {
  private readonly registry: ScreenRegistryService
  private readonly connections = new Map<string, ScreenSocketConnection>()

  constructor(registry: ScreenRegistryService) {
    this.registry = registry
  }

  handleOpen(socket: ScreenSocket): void {
    const connection: ScreenSocketConnection = {
      socket,
      closed: false,
      saturated: false,
      attachments: new Map()
    }
    this.connections.set(socket.data.socketId, connection)
    this.send(connection, {
      t: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      screens: this.registry.listSummaries()
    })
  }

  handleClose(socket: ScreenSocket): void {
    const connection = this.connections.get(socket.data.socketId)
    if (connection === undefined) {
      return
    }
    connection.closed = true
    for (const unsubscribe of connection.attachments.values()) {
      unsubscribe()
    }
    connection.attachments.clear()
    this.connections.delete(socket.data.socketId)
  }

  handleDrain(socket: ScreenSocket): void {
    const connection = this.connections.get(socket.data.socketId)
    if (connection !== undefined) {
      connection.saturated = false
    }
  }

  async handleMessage(socket: ScreenSocket, raw: string | Uint8Array): Promise<void> {
    const connection = this.connections.get(socket.data.socketId)
    if (connection === undefined) {
      return
    }

    const frame = this.parseClientFrame(raw)
    if (frame === null) {
      logWarn(`socket ${socket.data.socketId} sent an unparseable frame`)
      return
    }

    try {
      await this.dispatch(connection, frame)
    } catch (error) {
      logError(`socket ${socket.data.socketId} frame ${frame.t} failed`, error)
      this.send(connection, {
        t: 'screen.error',
        screenId: frame.screenId,
        message: describeError(error)
      })
    }
  }

  private parseClientFrame(raw: string | Uint8Array): ClientFrame | null {
    const text = typeof raw === 'string' ? raw : textDecoder.decode(raw)
    let decoded: unknown
    try {
      decoded = JSON.parse(text)
    } catch {
      return null
    }
    const parsed = ClientFrameSchema.safeParse(decoded)
    return parsed.success ? parsed.data : null
  }

  private async dispatch(connection: ScreenSocketConnection, frame: ClientFrame): Promise<void> {
    switch (frame.t) {
      case 'attach':
        await this.handleAttach(connection, frame.screenId)
        return
      case 'detach':
        this.handleDetach(connection, frame.screenId)
        return
      case 'prompt': {
        const screen = await this.registry.getScreen(frame.screenId)
        if (screen === null) {
          this.sendUnknownScreen(connection, frame.screenId)
          return
        }
        screen.promptScreen(frame.text, frame.streamingBehavior ?? null, frame.images ?? [])
        return
      }
      case 'bash': {
        const screen = await this.registry.getScreen(frame.screenId)
        if (screen === null) {
          this.sendUnknownScreen(connection, frame.screenId)
          return
        }
        screen.runBash(frame.command)
        return
      }
      case 'set_model': {
        const screen = await this.registry.getScreen(frame.screenId)
        if (screen === null) {
          this.sendUnknownScreen(connection, frame.screenId)
          return
        }
        // The provider/id pair is passed through unvalidated on purpose: the screen
        // owns the registry that decides whether it resolves, and a second opinion
        // here would be a second catalog to keep in step with it.
        //
        // The refusal comes back rather than being broadcast, so it reaches the tab
        // that clicked and not every other tab watching the screen. A SUCCESS still
        // broadcasts, from inside the service — the new model is a fact about the
        // screen, not about this socket.
        const reason = await screen.setModel(frame.provider, frame.modelId)
        if (reason !== null) {
          this.send(connection, {
            t: 'screen.error',
            screenId: frame.screenId,
            message: reason
          })
        }
        return
      }
      case 'abort': {
        const screen = await this.registry.getScreen(frame.screenId)
        if (screen === null) {
          this.sendUnknownScreen(connection, frame.screenId)
          return
        }
        screen.abortScreen()
        return
      }
    }
  }

  private async handleAttach(connection: ScreenSocketConnection, screenId: string): Promise<void> {
    const screen = await this.registry.getScreen(screenId)
    if (screen === null) {
      this.sendUnknownScreen(connection, screenId)
      return
    }
    // The socket can close while the screen is being created.
    if (connection.closed) {
      return
    }

    // A re-attach after a detected gap must not add a second subscription; it
    // just needs a fresh snapshot.
    if (!connection.attachments.has(screenId)) {
      const unsubscribe = screen.subscribe({
        deliver: (outbound) => {
          this.send(connection, outbound)
        },
        isSaturated: () => connection.saturated
      })
      connection.attachments.set(screenId, unsubscribe)
    }

    this.send(connection, screen.snapshotFrame())
    // After the snapshot, never before: the palette is a sidecar to a rendered
    // screen, and a client that got commands first would have nowhere to put them.
    this.send(connection, screen.commandsFrame())
    // Same rule, same reason. The snapshot's state names the model the screen is
    // ON; this names the ones it can move to, so it is meaningless before the
    // client knows where it started.
    this.send(connection, screen.modelsFrame())
  }

  private handleDetach(connection: ScreenSocketConnection, screenId: string): void {
    const unsubscribe = connection.attachments.get(screenId)
    if (unsubscribe === undefined) {
      return
    }
    unsubscribe()
    connection.attachments.delete(screenId)
  }

  private sendUnknownScreen(connection: ScreenSocketConnection, screenId: string): void {
    this.send(connection, {
      t: 'screen.error',
      screenId,
      message: `unknown screen "${screenId}"`
    })
  }

  private send(connection: ScreenSocketConnection, frame: ServerFrame): void {
    if (connection.closed || connection.socket.readyState !== WEBSOCKET_OPEN) {
      return
    }
    if (connection.saturated && frame.t === 'screen.event') {
      return
    }

    const sent = connection.socket.send(toJsonText(frame))
    if (sent === WEBSOCKET_SEND_ENQUEUED) {
      connection.saturated = true
      return
    }
    if (sent === WEBSOCKET_SEND_DROPPED) {
      connection.saturated = true
    }
  }
}
