/**
 * TenantThrottlerGuard
 *
 * Extends NestJS ThrottlerGuard to key rate limits by tenantId instead of IP.
 * This prevents a single tenant from consuming all capacity on a shared IP
 * (common when clients sit behind a corporate proxy or API gateway).
 *
 * Additionally applies a per-tier sliding window check using SlidingWindowRateLimiter:
 *   free      → 30 req/min
 *   starter   → 100 req/min
 *   pro       → 500 req/min
 *   enterprise→ 2000 req/min
 *
 * Falls back to IP-based keying for unauthenticated requests (e.g. /auth/login).
 *
 * Registration: replace ThrottlerGuard in AppModule providers array:
 *   { provide: APP_GUARD, useClass: TenantThrottlerGuard }
 */

import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ThrottlerGuard, InjectThrottlerOptions, InjectThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { SlidingWindowRateLimiter } from '../rate-limit/sliding-window.service';

type TenantTier = 'free' | 'starter' | 'pro' | 'enterprise';

const TIER_LIMITS: Record<TenantTier, { rpm: number }> = {
  free:       { rpm: 30    },
  starter:    { rpm: 100   },
  pro:        { rpm: 500   },
  enterprise: { rpm: 2_000 },
};

// AI endpoints are expensive and slow (20-60 s each). Apply a stricter
// per-user limit on top of the per-tenant limit so one heavy user cannot
// exhaust the tenant's shared quota. These limits are generous relative to
// the actual throughput possible (max ~3 req/min at 20 s/call).
const AI_USER_RPM: Record<TenantTier, number> = {
  free:       5,
  starter:    10,
  pro:        20,
  enterprise: 60,
};

// JWT has no `tier` claim — derive tier from role so admins aren't capped at free limits.
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

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: any,
    @InjectThrottlerStorage() storage: any,
    reflector: Reflector,
    private readonly slidingWindow: SlidingWindowRateLimiter,
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

    // Health and metrics endpoints must never be throttled — Docker and Prometheus
    // hit them frequently from internal IPs and share the Redis bucket across slots.
    const path: string = req.path ?? '';
    if (path.includes('/health/') || path.endsWith('/health') || path.includes('/metrics')) {
      return true;
    }

    const baseAllowed = await super.canActivate(context);
    if (!baseAllowed) return false;

    const res = context.switchToHttp().getResponse<Response>();
    const user = (req as any).user as {
      id?: string;
      tenantId?: string;
      tier?: TenantTier;
      role?: string;
    } | undefined;

    if (!user?.tenantId) return true;

    const tier = user.tier ?? tierFromRole(user.role);
    const { rpm } = TIER_LIMITS[tier] ?? TIER_LIMITS.free;

    // ── Per-tenant sliding window ──────────────────────────────────────────────
    const tenantResult = await this.slidingWindow.check(
      `swrl:tenant:${user.tenantId}:rpm`,
      rpm,
      60_000,
    );

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

    // ── Per-user AI sliding window ─────────────────────────────────────────────
    // AI calls are expensive (20-60 s each). Without a per-user check, a single
    // user can exhaust the entire tenant's shared bucket. This secondary check
    // uses the JWT subject (user.id ?? user.sub) to isolate each user's AI quota.
    // Passport-JWT populates `sub` from the token; some strategies also copy it
    // to `id`. We accept either so the guard works regardless of JWT shape.
    const userId = user.id ?? (user as any).sub;
    if (userId && path.includes('/ai/')) {
      const aiRpm = AI_USER_RPM[tier] ?? AI_USER_RPM.free;
      const aiResult = await this.slidingWindow.check(
        `swrl:user:${userId}:ai:rpm`,
        aiRpm,
        60_000,
      );

      if (!aiResult.allowed) {
        res.setHeader('X-RateLimit-Limit', aiRpm);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + 60);
        res.setHeader('Retry-After', '60');

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: `AI rate limit exceeded: ${aiRpm} req/min per user.`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }
}
