/**
 * TenantThrottlerGuard
 *
 * Two distinct limiting strategies, chosen by path:
 *
 *   Non-AI paths  →  NestJS ThrottlerGuard (fixed window, per tenant key)
 *                    + per-tenant sliding window (tier-based RPM)
 *
 *   AI paths      →  Concurrency-based limit only (RPM is wrong for 20–60 s calls)
 *                    ADMIN / SUPER_ADMIN bypass this limit entirely.
 *                    Other roles get a per-user slot cap:
 *                      free: 1  starter: 2  pro: 3  enterprise: 5
 *                    Returns 503 (capacity) not 429 (rate) when at limit.
 *
 * Why concurrency instead of RPM for AI?
 *   A 60-req/min limit sounds generous but fails immediately under concurrency:
 *   fire 5 requests at t=0 before any response arrives → 5 increments recorded
 *   → blocked for the rest of the window even though only 1–2 calls can realistically
 *   complete per minute at 20–60 s each. Concurrency tracks *in-flight* requests,
 *   which is the actual resource being consumed.
 *
 * Slot lifecycle:
 *   guard.canActivate  → tryAcquire → marks req[AI_CONCURRENCY_USER_KEY]
 *   AiConcurrencyInterceptor.finalize → release (success, error, or cancellation)
 *   Safety TTL (120 s) → auto-expires slot if server dies before release
 */

import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ThrottlerGuard,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { SlidingWindowRateLimiter } from '../rate-limit/sliding-window.service';
import { AiConcurrencyService } from '../rate-limit/ai-concurrency.service';
import { AI_CONCURRENCY_USER_KEY } from '../interceptors/ai-concurrency.interceptor';

type TenantTier = 'free' | 'starter' | 'pro' | 'enterprise';

const TIER_LIMITS: Record<TenantTier, { rpm: number }> = {
  free:       { rpm: 30    },
  starter:    { rpm: 100   },
  pro:        { rpm: 500   },
  enterprise: { rpm: 2_000 },
};

const AI_MAX_CONCURRENT: Record<TenantTier, number> = {
  free:       1,
  starter:    2,
  pro:        3,
  enterprise: 5,
};

// 2× the worst-case AI call duration so a crashed server doesn't permanently
// block the user. The interceptor releases proactively well before this fires.
const AI_SLOT_SAFETY_TTL_MS = 120_000;

function tierFromRole(role?: string): TenantTier {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return 'enterprise';
    case 'SALES_MANAGER':
      return 'pro';
    case 'SALES_REP':
      return 'starter';
    default:
      return 'free';
  }
}

type RequestUser = {
  id?: string;
  sub?: string;
  tenantId?: string;
  tier?: TenantTier;
  role?: string;
};

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(TenantThrottlerGuard.name);

  constructor(
    @InjectThrottlerOptions() options: any,
    @InjectThrottlerStorage() storage: any,
    reflector: Reflector,
    private readonly slidingWindow: SlidingWindowRateLimiter,
    private readonly aiConcurrency: AiConcurrencyService,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(req: Request): Promise<string> {
    const tenantId = (req as any).user?.tenantId as string | undefined;
    if (tenantId) return `tenant:${tenantId}`;
    return (
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip ??
      'unknown'
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const path: string = req.path ?? '';

    if (path.includes('/health/') || path.endsWith('/health') || path.includes('/metrics')) {
      return true;
    }

    const user = (req as any).user as RequestUser | undefined;

    if (path.includes('/ai/')) {
      return this.handleAiRequest(req, res, path, user);
    }

    return this.handleStandardRequest(context, res, path, user);
  }

  // ── AI paths: concurrency-based limiting only ──────────────────────────────

  private async handleAiRequest(
    req: Request,
    res: Response,
    path: string,
    user: RequestUser | undefined,
  ): Promise<boolean> {
    if (!user?.tenantId) return true;

    const userId = user.id ?? user.sub;
    const tier   = user.tier ?? tierFromRole(user.role);
    const role   = user.role;

    // ADMIN/SUPER_ADMIN: bypass entirely — trusted users, no capacity concerns
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      this.logger.debug(JSON.stringify({
        userId, tenantId: user.tenantId, tier, endpoint: path,
        limitType: 'ai-user', allowed: true, remaining: 'unlimited',
      }));
      return true;
    }

    if (!userId) return true;

    const maxConcurrent = AI_MAX_CONCURRENT[tier] ?? AI_MAX_CONCURRENT.free;
    const acquired = await this.aiConcurrency.tryAcquire(userId, maxConcurrent, AI_SLOT_SAFETY_TTL_MS);
    const currentCount = acquired
      ? await this.aiConcurrency.getCount(userId)
      : maxConcurrent;

    this.logger.debug(JSON.stringify({
      userId, tenantId: user.tenantId, tier, endpoint: path,
      limitType: 'ai-user', allowed: acquired,
      concurrent: currentCount, maxConcurrent,
    }));

    if (!acquired) {
      res.setHeader('X-AI-Concurrent-Limit', maxConcurrent);
      res.setHeader('X-AI-Concurrent-Remaining', 0);
      res.setHeader('Retry-After', '30');

      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'Service Unavailable',
          message: `AI capacity reached: max ${maxConcurrent} concurrent AI request(s) per user. Please wait for an active request to complete.`,
          retryAfterSeconds: 30,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Signal the interceptor to release this slot when the response finishes
    (req as any)[AI_CONCURRENCY_USER_KEY] = userId;
    res.setHeader('X-AI-Concurrent-Limit', maxConcurrent);
    res.setHeader('X-AI-Concurrent-Remaining', maxConcurrent - currentCount);
    return true;
  }

  // ── Standard paths: NestJS fixed window + per-tenant sliding window ────────

  private async handleStandardRequest(
    context: ExecutionContext,
    res: Response,
    path: string,
    user: RequestUser | undefined,
  ): Promise<boolean> {
    const baseAllowed = await super.canActivate(context);
    if (!baseAllowed) return false;

    if (!user?.tenantId) return true;

    const tier      = user.tier ?? tierFromRole(user.role);
    const { rpm }   = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
    const userId    = user.id ?? user.sub;

    const tenantResult = await this.slidingWindow.check(
      `swrl:tenant:${user.tenantId}:rpm`,
      rpm,
      60_000,
    );

    this.logger.debug(JSON.stringify({
      userId, tenantId: user.tenantId, tier, endpoint: path,
      limitType: 'tenant', allowed: tenantResult.allowed,
      remaining: tenantResult.remaining,
    }));

    if (!tenantResult.allowed) {
      res.setHeader('X-RateLimit-Limit', rpm);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);
      res.setHeader('Retry-After', '60');

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded for tier [${tier}]: ${rpm} req/min.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    res.setHeader('X-RateLimit-Limit', rpm);
    res.setHeader('X-RateLimit-Remaining', tenantResult.remaining);
    return true;
  }
}
