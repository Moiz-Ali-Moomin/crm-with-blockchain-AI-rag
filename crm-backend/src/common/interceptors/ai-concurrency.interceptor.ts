import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Request } from 'express';
import { AiConcurrencyService } from '../rate-limit/ai-concurrency.service';

// Key written by TenantThrottlerGuard when a concurrency slot is acquired.
// The interceptor reads it to know which user's slot to release on completion.
export const AI_CONCURRENCY_USER_KEY = '__aiConcurrencyUserId';

@Injectable()
export class AiConcurrencyInterceptor implements NestInterceptor {
  constructor(private readonly concurrency: AiConcurrencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const userId = (req as any)[AI_CONCURRENCY_USER_KEY] as string | undefined;

    // No slot was acquired (non-AI path or admin bypass) — pass through
    if (!userId) return next.handle();

    // finalize() runs on both success and error, including uncaught handler exceptions
    return next.handle().pipe(
      finalize(() => {
        this.concurrency.release(userId).catch(() => {});
      }),
    );
  }
}
