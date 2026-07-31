import { clearInterval, setInterval } from 'node:timers'

import type { AgentSessionEvent, PromptOptions } from '@earendil-works/pi-coding-agent'
import { AgentSession, createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent'
import {
  COALESCE_INTERVAL_MS,
  MAX_TOOL_OUTPUT_CHARS
} from '@tribes-harness/protocol/common/Constants'
import type { ScreenEvent } from '@tribes-harness/protocol/types/ScreenEvent'
import type {
  ScreenState,
  ScreenStatus,
  ServerFrame,
  StreamingBehavior
} from '@tribes-harness/protocol/types/ScreenProtocol'

import {
  BACKPRESSURE_POLL_MS,
  MAX_BACKPRESSURE_WAIT_MS,
  USER_BASH_TOOL_CALL_PREFIX
} from '@/common/GatewayLimits'
import { delay } from '@/helpers/Delay'
import type { CoalescerState } from '@/types/EventCoalescer'
import type { ActiveBashRun, ScreenConfig, ScreenSubscriber } from '@/types/Screen'
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
import { toScreenCommands } from '@/utils/ScreenCommands'
import { foldMessagesToBlocks } from '@/utils/SessionReplay'
import { truncateText } from '@/utils/TextTruncation'
import { isBashRunFailed, renderUserBashInvocation } from '@/utils/ToolRendering'
import { activeBashBlocks, boundBashChunk } from '@/utils/UserBash'

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
  /** Distinguishes one `!` run from the next in the minted tool-call id. */
  private bashRunCount = 0
  /**
   * `!` runs that have started but not finished, keyed by their synthetic tool-call
   * id. Pi only records a bash run into its message list when it COMPLETES, so
   * without this a snapshot taken mid-run omits the running command entirely.
   */
  private readonly activeBashRuns = new Map<string, ActiveBashRun>()

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
      blocks: [
        ...foldMessagesToBlocks({ messages: this.session.messages, streamingMessage }),
        // Pi has not recorded these yet — they only enter its message list once the
        // command exits. A client attaching mid-run would otherwise be told the
        // transcript contains no such block, and then receive output for it.
        ...activeBashBlocks(this.activeBashRuns)
      ],
      state: this.buildState()
    }
  }

  /**
   * The `/` palette. Sent once per attach rather than folded into the snapshot:
   * the set is fixed for a session's lifetime, and snapshots are re-sent on every
   * user message, which would put the whole skill catalog back on the wire each
   * time.
   */
  commandsFrame(): ServerFrame {
    return {
      t: 'screen.commands',
      screenId: this.config.screenId,
      commands: toScreenCommands({
        extensionCommands: this.session.extensionRunner.getRegisteredCommands(),
        promptTemplates: this.session.promptTemplates,
        skills: this.session.resourceLoader.getSkills().skills
      })
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

  /**
   * Run a `!` bash line and SYNTHESIZE the frames for it.
   *
   * `executeBash` emits no event of its own — Pi stores a `bashExecution` message
   * and folds it into the context of the NEXT prompt rather than answering it — so
   * nothing reaches `handleSessionEvent` and the screen would otherwise show a
   * command that ran invisibly. The run is rendered through the existing
   * tool-block path so it needs no new UI, marked `origin: 'user'` so the operator
   * can still tell it apart from the agent's own work.
   *
   * Every frame goes through `pushEvents`, never `emitEvents` directly, so the
   * bash stream shares one coalescer and one `seq` with the agent stream: order
   * and gap detection hold across both.
   */
  runBash(command: string): void {
    if (this.session.isBashRunning) {
      // Pi keeps ONE bash abort controller. A second concurrent run silently
      // overwrites it, leaving the first unstoppable, and Pi has no queue to put
      // this on — so it is refused rather than started.
      this.pushEvents([
        { kind: 'error', message: 'a bash command is already running on this screen' }
      ])
      return
    }

    this.bashRunCount += 1
    const toolCallId = `${USER_BASH_TOOL_CALL_PREFIX}${this.bashRunCount}`
    const run: ActiveBashRun = { command, output: '', emittedChars: 0 }
    this.activeBashRuns.set(toolCallId, run)
    this.pushEvents([
      { kind: 'tool_start', invocation: renderUserBashInvocation(toolCallId, command) }
    ])

    void this.session
      .executeBash(command, (chunk) => {
        // `replace: false`, unlike every other `tool_output` on this screen.
        // `tool_execution_update.partialResult` is a CUMULATIVE snapshot, so it
        // replaces; `onChunk` hands over one chunk of new output at a time, so
        // replacing would leave only the final chunk visible. This one appends.
        // The cap is CUMULATIVE, not per chunk. Truncating each chunk to
        // MAX_TOOL_OUTPUT_CHARS applies replace-semantics bounding to an append
        // stream: a marker gets spliced into the middle of the operator's live
        // output and everything past it in that chunk is lost, while the total
        // stays unbounded. Append until the budget is gone, then say so once.
        const bounded = boundBashChunk({ emittedChars: run.emittedChars, chunk })
        run.emittedChars = bounded.emittedChars
        if (bounded.slice.length === 0) {
          return
        }
        run.output += bounded.slice
        this.pushEvents([{ kind: 'tool_output', toolCallId, text: bounded.slice, replace: false }])
      })
      .then((result) => {
        this.activeBashRuns.delete(toolCallId)
        // A non-zero exit is NOT a gateway error: it is the result the operator
        // asked for, so it closes the block as failed and raises nothing else.
        this.pushEvents([
          {
            kind: 'tool_end',
            toolCallId,
            isError: isBashRunFailed(result.cancelled, result.exitCode),
            text: truncateText(result.output, MAX_TOOL_OUTPUT_CHARS)
          }
        ])
      })
      .catch((error: unknown) => {
        this.activeBashRuns.delete(toolCallId)
        // Reaching here means bash could not be run at all (no shell, spawn
        // failure) — an aborted run resolves normally with `cancelled: true`. The
        // block still has to be closed or it spins forever.
        this.pushEvents([
          { kind: 'tool_end', toolCallId, isError: true, text: describeError(error) },
          { kind: 'error', message: describeError(error) }
        ])
      })
  }

  /**
   * Abort BOTH the agent turn and any running `!` bash.
   *
   * They are independent: a bash run is not part of the agent's turn, so
   * `session.abort()` does not touch it and a `!sleep 600` would be unstoppable
   * from the UI. Both calls are unconditional because both are no-ops when
   * there is nothing to stop, and a UI that has to ask "which kind of busy is
   * this?" before it can offer a stop button is a UI that will get it wrong.
   */
  abortScreen(): void {
    this.session.abortBash()
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
    this.pushEvents(mapAgentSessionEvent(event))

    if (requiresSnapshotRefresh(event)) {
      // snapshotFrame() flushes for us — see the comment there.
      this.broadcast(this.snapshotFrame())
    }
    if (affectsScreenState(event)) {
      this.emitState()
    }
  }

  /**
   * The one way an event enters the stream. Everything — Pi's own events and the
   * frames synthesized for a `!` bash run — goes through this single coalescer so
   * wire order matches the order the events actually happened in.
   */
  private pushEvents(events: ScreenEvent[]): void {
    const nowMs = Date.now()
    for (const event of events) {
      const outcome = pushCoalescedEvent(this.coalescer, event, nowMs)
      this.coalescer = outcome.state
      this.emitEvents(outcome.emit)
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
