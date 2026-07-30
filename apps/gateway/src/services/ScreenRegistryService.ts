import type { ScreenSummary } from '@tribes-harness/protocol/types/ScreenProtocol'

import { PiScreenService } from '@/services/PiScreenService'
import type { ScreenConfig } from '@/types/Screen'

/**
 * screenId -> screen, created on first attach.
 *
 * The catalog is closed: an id that is not configured is rejected rather than
 * created, because creating a screen spawns a Pi agent with shell access and the
 * id comes off a socket.
 *
 * Today the catalog holds one entry. The registry is what makes a second screen
 * a config change instead of a rewrite.
 */
export class ScreenRegistryService {
  private readonly configsById: Map<string, ScreenConfig>
  private readonly screens = new Map<string, PiScreenService>()
  /** In-flight creations, so two attaches racing on one id cannot start two sessions. */
  private readonly creating = new Map<string, Promise<PiScreenService>>()

  constructor(configs: ScreenConfig[]) {
    this.configsById = new Map(configs.map((config) => [config.screenId, config]))
  }

  listSummaries(): ScreenSummary[] {
    return [...this.configsById.values()].map((config) => ({
      screenId: config.screenId,
      // Only the display name: `cwd` and `sessionDir` are host paths.
      title: config.title
    }))
  }

  async getScreen(screenId: string): Promise<PiScreenService | null> {
    const existing = this.screens.get(screenId)
    if (existing !== undefined) {
      return existing
    }

    const config = this.configsById.get(screenId)
    if (config === undefined) {
      return null
    }

    const inFlight = this.creating.get(screenId)
    if (inFlight !== undefined) {
      return inFlight
    }

    const creation = PiScreenService.create(config)
    this.creating.set(screenId, creation)
    try {
      const screen = await creation
      this.screens.set(screenId, screen)
      return screen
    } finally {
      this.creating.delete(screenId)
    }
  }

  disposeAll(): void {
    for (const screen of this.screens.values()) {
      screen.dispose()
    }
    this.screens.clear()
  }
}
