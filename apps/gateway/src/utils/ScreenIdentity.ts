import type { AgentMessage } from '@earendil-works/pi-agent-core'

import { THINKING_BLOCK_ID_SUFFIX } from '@/common/GatewayLimits'

/**
 * Stable block ids.
 *
 * Pi's `AgentMessage` has no id field, so the id has to be derived. `timestamp`
 * is the only property that is (a) assigned once when the message object is
 * created, (b) carried unchanged through every streaming partial — providers
 * build one object at stream start and mutate it — and (c) persisted verbatim in
 * the session JSONL. That makes the same message yield the same id whether it
 * arrives as a live delta or is read back from disk on reattach, which is
 * exactly the symmetry `ScreenBlock` requires.
 *
 * The role prefix keeps a user message and an assistant message that land in the
 * same millisecond apart.
 */
function rolePrefix(message: AgentMessage): string {
  switch (message.role) {
    case 'user':
      return 'usr'
    case 'assistant':
      return 'asst'
    case 'toolResult':
      return 'tres'
    case 'bashExecution':
      return 'bash'
    case 'custom':
      return 'cust'
    case 'branchSummary':
      return 'brsm'
    case 'compactionSummary':
      return 'cpsm'
  }
}

export function messageBlockId(message: AgentMessage): string {
  return `${rolePrefix(message)}-${message.timestamp}`
}

export function thinkingBlockId(messageId: string): string {
  return `${messageId}${THINKING_BLOCK_ID_SUFFIX}`
}
