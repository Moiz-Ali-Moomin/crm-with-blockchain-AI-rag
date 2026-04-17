/**
 * RedisThrottlerStorage
 *
 * Implements @nestjs/throttler v5 ThrottlerStorage using an ioredis client.
 *
 * Interface (v5.1.x):
 *   increment(key: string, ttl: number): Promise<{ totalHits, timeToExpire }>
 *
 * Each rate-limit key is stored as a Redis counter that expires after ttl ms.
 * INCR + PEXPIRE are pipelined so the operation is atomic within a single round-trip.
 */

import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

interface ThrottlerRecord {
  totalHits:    number;
  timeToExpire: number;
}

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttl: number): Promise<ThrottlerRecord> {
    const pipeline = this.redis.pipeline();
    pipeline.incr(key);
    pipeline.pexpire(key, ttl);
    pipeline.pttl(key);
    const results = await pipeline.exec();

    const totalHits:  number = (results?.[0]?.[1] as number) ?? 1;
    const pttlResult: number = (results?.[2]?.[1] as number) ?? ttl;
    // pttl returns -2 when key doesn't exist, -1 when no TTL — clamp to ttl
    const timeToExpire = Math.ceil(Math.max(pttlResult, ttl) / 1000);

    return { totalHits, timeToExpire };
  }
}
