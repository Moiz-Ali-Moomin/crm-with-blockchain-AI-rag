import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../core/cache/redis.service';

// Safety TTL caller must pass in. If the server crashes mid-request the key
// expires after this duration rather than permanently blocking the user.
const ACQUIRE_SCRIPT = `
local key    = KEYS[1]
local max    = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])
local count  = redis.call('INCR', key)
if count > max then
  redis.call('DECR', key)
  return 0
end
redis.call('PEXPIRE', key, ttl_ms)
return count
`;

// Decrement but never below 0; delete the key when the last slot is freed so
// we don't leave stale zero-counters with no TTL in Redis.
const RELEASE_SCRIPT = `
local key = KEYS[1]
local val = tonumber(redis.call('GET', key) or '0')
if val <= 0 then return 0 end
local new_val = redis.call('DECR', key)
if new_val <= 0 then redis.call('DEL', key) end
return new_val
`;

@Injectable()
export class AiConcurrencyService {
  private readonly logger = new Logger(AiConcurrencyService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Attempt to acquire one concurrent AI slot for `userId`.
   * Returns true when the slot was granted, false when already at capacity.
   * `safetyTtlMs` is the wall-clock upper bound of a single AI call; after this
   * the slot auto-expires even if the server dies before releasing it.
   */
  async tryAcquire(userId: string, maxConcurrent: number, safetyTtlMs: number): Promise<boolean> {
    const key = `ai:concurrent:${userId}`;
    try {
      const result = await this.redis.client.eval(
        ACQUIRE_SCRIPT,
        1,
        key,
        String(maxConcurrent),
        String(safetyTtlMs),
      );
      return (result as number) > 0;
    } catch (err) {
      // Fail open: Redis error must not block a legitimate user
      this.logger.error(`AiConcurrencyService.tryAcquire failed: ${(err as Error).message}`);
      return true;
    }
  }

  /** Release one concurrent AI slot for `userId`. Fire-and-forget safe. */
  async release(userId: string): Promise<void> {
    const key = `ai:concurrent:${userId}`;
    try {
      await this.redis.client.eval(RELEASE_SCRIPT, 1, key);
    } catch (err) {
      this.logger.error(`AiConcurrencyService.release failed: ${(err as Error).message}`);
    }
  }

  /** Current in-flight count for `userId` (used for debug logging). */
  async getCount(userId: string): Promise<number> {
    try {
      const val = await this.redis.client.get(`ai:concurrent:${userId}`);
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  }
}
