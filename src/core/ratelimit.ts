/**
 * Token-bucket rate limiter, one bucket per provider. Callers `acquire()`
 * before each request; the promise resolves when a token is available.
 * FIFO fairness via an internal queue.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RateLimitConfig {
  /** Maximum burst size. */
  capacity: number;
  /** Sustained tokens per second. */
  refillPerSecond: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly config: RateLimitConfig) {
    if (config.capacity < 1 || config.refillPerSecond <= 0) {
      throw new RangeError('TokenBucket requires capacity >= 1 and refillPerSecond > 0');
    }
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.config.capacity, this.tokens + elapsed * this.config.refillPerSecond);
    this.lastRefill = now;
  }

  /** Resolves when a token has been consumed. Requests are served FIFO. */
  acquire(): Promise<void> {
    const turn = this.queue.then(async () => {
      this.refill();
      // Re-check after every sleep: a penalize() landing mid-sleep must be
      // honored, not forgiven by a clamp.
      while (this.tokens < 1) {
        const deficitMs = ((1 - this.tokens) / this.config.refillPerSecond) * 1000;
        await sleep(Math.ceil(deficitMs));
        this.refill();
      }
      this.tokens -= 1;
    });
    // Subsequent acquirers wait behind this one, even if it rejects.
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  /** Report an external 429: drain the bucket so callers back off. */
  penalize(): void {
    this.tokens = 0;
    this.lastRefill = Date.now();
  }
}

const buckets = new Map<string, TokenBucket>();

/** Shared per-key (typically per-provider) bucket registry. */
export function bucketFor(key: string, config: RateLimitConfig): TokenBucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = new TokenBucket(config);
    buckets.set(key, bucket);
  }
  return bucket;
}

export function resetBucketsForTests(): void {
  buckets.clear();
}
