import { isConfigured, type ProviderId } from '../core/config.js';
import { nowIso } from '../core/time.js';
import type { HealthCheckResult, ProviderAdapter, ProviderMeta } from './types.js';

/**
 * Shared adapter plumbing. Concrete adapters implement `liveProbe()` with
 * exactly one minimal-quota request; everything else (configured checks,
 * error folding, timing) lives here so behavior is uniform across
 * providers.
 */
export abstract class BaseAdapter implements ProviderAdapter {
  abstract readonly id: ProviderId;
  abstract readonly meta: ProviderMeta;

  isConfigured(): boolean {
    return isConfigured(this.id);
  }

  /** One minimal-quota live request proving auth + connectivity. */
  protected abstract liveProbe(): Promise<void>;

  async healthCheck(opts: { live?: boolean } = {}): Promise<HealthCheckResult> {
    const configured = this.isConfigured();
    const checkedAt = nowIso();
    if (!configured) {
      return {
        provider: this.id,
        configured,
        live: null,
        message: `not configured: set ${this.meta.envVar}`,
        checkedAt,
      };
    }
    if (!opts.live) {
      return {
        provider: this.id,
        configured,
        live: null,
        message: 'configured (live check not attempted)',
        checkedAt,
      };
    }
    const started = Date.now();
    try {
      await this.liveProbe();
      return {
        provider: this.id,
        configured,
        live: true,
        latencyMs: Date.now() - started,
        message: 'live probe succeeded',
        checkedAt,
      };
    } catch (error) {
      // Error messages from the platform taxonomy are already redacted.
      return {
        provider: this.id,
        configured,
        live: false,
        latencyMs: Date.now() - started,
        message: error instanceof Error ? error.message : String(error),
        checkedAt,
      };
    }
  }
}
