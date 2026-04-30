import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

/**
 * CSRF Guard — Custom Header Requirement pattern.
 *
 * Since this API uses HttpOnly cookies, cross-site requests from a browser
 * cannot set custom headers (blocked by the CORS preflight). Requiring either
 * X-Requested-With: XMLHttpRequest or a non-empty X-CSRF-Token header on all
 * state-changing requests is a lightweight, stateless CSRF mitigation that is
 * standard for SPA + cookie-auth architectures.
 *
 * Applies to: POST, PATCH, PUT, DELETE.
 * GET/HEAD/OPTIONS are inherently safe (must not mutate state).
 *
 * Register globally in AppModule providers:
 *   { provide: APP_GUARD, useClass: CsrfGuard }
 */

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    if (!STATE_CHANGING_METHODS.has(req.method.toUpperCase())) return true;

    const xRequestedWith = req.headers['x-requested-with'];
    const xCsrfToken     = req.headers['x-csrf-token'];

    if (xRequestedWith === 'XMLHttpRequest' || xCsrfToken) return true;

    throw new ForbiddenException(
      'CSRF check failed. State-changing requests must include ' +
      'X-Requested-With: XMLHttpRequest or a non-empty X-CSRF-Token header.',
    );
  }
}
