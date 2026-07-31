import type { ScreenStatus } from '@tribes-harness/protocol/types/ScreenProtocol'

/**
 * What the screen is doing, as reported to the browser.
 *
 * The subtlety is `runEnded`. Pi dispatches `agent_end` BEFORE it clears
 * `AgentSession.isStreaming`, so a status read from the live flag while handling
 * that event reports a run that is already over as still streaming — and because
 * `agent_end` is the last state-affecting event of the run, no later frame ever
 * corrects it. The visible symptom is a Stop button that stays armed and a
 * composer stuck on "Steer the run…" with nothing running.
 *
 * So the END of a run is taken from the event, which is authoritative, rather than
 * from a flag whose timing we do not control.
 */

export type DeriveScreenStatusParams = {
  isRetrying: boolean
  isCompacting: boolean
  isStreaming: boolean
  /** True only while handling `agent_end` — the run is over by definition. */
  runEnded: boolean
  /** `agent_end.willRetry`: Pi is about to run again, so this is not idle. */
  willRetry: boolean
}

export function deriveScreenStatus(params: DeriveScreenStatusParams): ScreenStatus {
  if (params.isRetrying) {
    return 'retrying'
  }
  if (params.isCompacting) {
    return 'compacting'
  }
  if (params.runEnded) {
    return params.willRetry ? 'retrying' : 'idle'
  }
  if (params.isStreaming) {
    return 'streaming'
  }
  return 'idle'
}
