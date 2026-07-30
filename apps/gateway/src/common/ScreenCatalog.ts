import { DEFAULT_SCREEN_ID } from '@tribes-harness/protocol/common/Constants'

import { PI_SCREEN_CWD, PI_SCREEN_SESSION_DIR } from '@/common/Env'
import type { ScreenConfig } from '@/types/Screen'

/**
 * The screens this gateway will host. A client can only attach to an id that
 * appears here — attaching is what creates the Pi session, so an open list would
 * let a browser spawn unbounded agent processes.
 */
export const SCREEN_CONFIGS: ScreenConfig[] = [
  {
    screenId: DEFAULT_SCREEN_ID,
    title: 'main',
    cwd: PI_SCREEN_CWD,
    sessionDir: PI_SCREEN_SESSION_DIR
  }
]
