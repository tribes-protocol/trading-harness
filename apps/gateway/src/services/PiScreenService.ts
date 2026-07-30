import { clearInterval, setInterval } from 'node:timers'

import type { AgentSessionEvent, PromptOptions } from '@earendil-works/pi-coding-agent'
import { AgentSession, createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent'
import { COALESCE_INTERVAL_MS } from '@tribes-harness/protocol/common/Constants'
import type { ScreenEvent } from '@tribes-harness/protocol/types/ScreenEvent'
import type {
  ScreenState,
  ScreenStatus,
  ServerFrame,
  StreamingBehavior
} from '@tribes-harness/protocol/types/ScreenProtocol'

import { BACKPRESSURE_POLL_MS, MAX_BACKPRESSURE_WAIT_MS } from '@/common/GatewayLimits'
import { delay } from '@/helpers/Delay'
import type { CoalescerState } from '@/types/EventCoalescer'
import type { ScreenConfig, ScreenSubscriber } from '@/types/Screen'
import {
  createCoalescerState,
  flushCoalescer,
  pushCoalescedEvent,
  tickCoalescer
} from '@/utils/EventCoalescer'
import {
  affectsScreenState,
  mapAgentSessionEvent,
  requiresSnapshotRefresh
} from '@/utils/EventMapping'
import { describeError, logError } from '@/utils/Logger'
import { foldMessagesToBlocks } from '@/utils/SessionReplay'

/**
 * One hosted Pi screen: an `AgentSession`, its normalized frame stream, and the
 * set of sockets currently watching it.
 *
 * Two subscriptions, on purpose, mirroring Pi's own RPC mode:
 *  - `session.subscribe` is synchronous with no backpressure hook. It is the
 *    only place the session-level events (queue, compaction, retry) appear, so
 *    it is where frames are produced.
 *  - `session.agent.subscribe` is the only AWAITED hook. Holding it is the only
 *    way to make the agent wait for a slow consumer, so it is where saturation
 *    is absorbed.
 */
export class PiScreenService {
  private readonly config: ScreenConfig
  private readonly session: AgentSession
  private readonly subscribers = new Set<ScreenSubscriber>()
  private coalescer: CoalescerState = createCoalescerState()
  /** Monotonic per screen. A gap tells a client it missed a frame and must re-attach. */
  private seq = 0
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeSession: (() => void) | null = null
  private unsubscribeBackpressure: (() => void) | null = null

  private constructor(config: ScreenConfig, session: AgentSession) {
    this.config = config
    this.session = session

    this.unsubscribeSession = session.subscribe((event) => {
      this.handleSessionEvent(event)
    })
    this.unsubscribeBackpressure = session.agent.subscribe(async () => {
      await this.awaitSubscriberCapacity()
    })
    this.flushTimer = setInterval(() => {
      this.flushDueDeltas()
    }, COALESCE_INTERVAL_MS)
  }

  static async create(config: ScreenConfig): Promise<PiScreenService> {
    // The explicit sessionDir is load-bearing. Session JSONL has no cross-process
    // lock and SessionManager rewrites the file from its in-memory array, so
    // sharing a directory with the `pi` CLI running in this cwd would erase that
    // agent's history.
    const sessionManager = SessionManager.create(config.cwd, config.sessionDir)
    const created = await createAgentSession({ cwd: config.cwd, sessionManager })
    return new PiScreenService(config, created.session)
  }

  subscribe(subscriber: ScreenSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  snapshotFrame(): ServerFrame {
    // Flushing FIRST is the whole correctness argument for this method, not an
    // optimization. A snapshot folds `streamingMessage`, which is the CUMULATIVE
    // partial — it already contains every delta the coalescer is still holding.
    // Emit the snapshot with deltas outstanding and those deltas land *after* it
    // with a higher seq, so the client appends text the snapshot already showed:
    // one assistant block reading "Hello ld" plus a duplicate reading "world".
    // Flushing here makes it impossible to build a snapshot that overlaps a
    // pending delta, whoever calls it and for whatever reason.
    this.flushAllDeltas()
    const streamingMessage = this.session.state.streamingMessage ?? null
    return {
      t: 'screen.snapshot',
      screenId: this.config.screenId,
      // Deliberately not `seq + 1`: the snapshot describes the stream as of the
      // last frame sent, so the client's gap detector stays aligned.
      seq: this.seq,
      leafEntryId: this.session.sessionManager.getLeafId(),
      blocks: foldMessagesToBlocks({ messages: this.session.messages, streamingMessage }),
      state: this.buildState()
    }
  }

  /**
   * Fire-and-forget: `AgentSession.prompt` only resolves when the whole turn is
   * over, and the socket handler that called this must not block for minutes.
   */
  promptScreen(text: string, streamingBehavior: StreamingBehavior | null): void {
    const options: PromptOptions = streamingBehavior === null ? {} : { streamingBehavior }
    void this.session.prompt(text, options).catch((error: unknown) => {
      this.emitEvents([{ kind: 'error', message: describeError(error) }])
    })
  }

  abortScreen(): void {
    void this.session.abort().catch((error: unknown) => {
      this.emitEvents([{ kind: 'error', message: describeError(error) }])
    })
  }

  dispose(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.unsubscribeSession?.()
    this.unsubscribeSession = null
    this.unsubscribeBackpressure?.()
    this.unsubscribeBackpressure = null
    this.subscribers.clear()
    this.session.dispose()
  }

  private handleSessionEvent(event: AgentSessionEvent): void {
    const nowMs = Date.now()
    for (const screenEvent of mapAgentSessionEvent(event)) {
      const outcome = pushCoalescedEvent(this.coalescer, screenEvent, nowMs)
      this.coalescer = outcome.state
      this.emitEvents(outcome.emit)
    }

    if (requiresSnapshotRefresh(event)) {
      // snapshotFrame() flushes for us — see the comment there.
      this.broadcast(this.snapshotFrame())
    }
    if (affectsScreenState(event)) {
      this.emitState()
    }
  }

  private flushDueDeltas(): void {
    const outcome = tickCoalescer(this.coalescer, Date.now())
    this.coalescer = outcome.state
    this.emitEvents(outcome.emit)
  }

  private flushAllDeltas(): void {
    const outcome = flushCoalescer(this.coalescer)
    this.coalescer = outcome.state
    this.emitEvents(outcome.emit)
  }

  private emitEvents(events: ScreenEvent[]): void {
    for (const event of events) {
      this.seq += 1
      this.broadcast({
        t: 'screen.event',
        screenId: this.config.screenId,
        seq: this.seq,
        event
      })
    }
  }

  private emitState(): void {
    this.seq += 1
    this.broadcast({
      t: 'screen.state',
      screenId: this.config.screenId,
      seq: this.seq,
      state: this.buildState()
    })
  }

  /**
   * A subscriber that throws is dropped rather than allowed to abort the fan-out:
   * a socket can close at any point mid-stream and must not take the screen, or
   * the other watchers, down with it.
   */
  private broadcast(frame: ServerFrame): void {
    for (const subscriber of [...this.subscribers]) {
      try {
        subscriber.deliver(frame)
      } catch (error) {
        logError(`screen ${this.config.screenId} subscriber failed`, error)
        this.subscribers.delete(subscriber)
      }
    }
  }

  private buildState(): ScreenState {
    const stats = this.session.getSessionStats()
    const usage = this.session.getContextUsage()
    const model = this.session.model
    return {
      status: this.currentStatus(),
      // `stats.sessionFile` and `SessionInfo.path` are absolute host paths and
      // are never read here.
      model: model === undefined ? null : `${model.provider}/${model.id}`,
      thinkingLevel: this.session.thinkingLevel,
      contextPercent: usage?.percent ?? null,
      costUsd: stats.cost,
      queue: {
        steering: [...this.session.getSteeringMessages()],
        followUp: [...this.session.getFollowUpMessages()]
      }
    }
  }

  private currentStatus(): ScreenStatus {
    if (this.session.isRetrying) {
      return 'retrying'
    }
    if (this.session.isCompacting) {
      return 'compacting'
    }
    if (this.session.isStreaming) {
      return 'streaming'
    }
    return 'idle'
  }

  private hasSaturatedSubscriber(): boolean {
    for (const subscriber of this.subscribers) {
      if (subscriber.isSaturated()) {
        return true
      }
    }
    return false
  }

  /**
   * Bounded: delta frames are dropped rather than queued, so this only smooths a
   * burst. One wedged tab must never stall the agent for the other watchers.
   */
  private async awaitSubscriberCapacity(): Promise<void> {
    let waitedMs = 0
    while (waitedMs < MAX_BACKPRESSURE_WAIT_MS && this.hasSaturatedSubscriber()) {
      await delay(BACKPRESSURE_POLL_MS)
      waitedMs += BACKPRESSURE_POLL_MS
    }
  }
}
