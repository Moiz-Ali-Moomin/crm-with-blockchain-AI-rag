import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from '../decorators/current-user.decorator';
import { PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';
import { hasPermission } from '../rbac/rbac.permissions';

/**
 * RbacGuard — route-level permission gate.
 *
 * Reads the @RequirePermission(resource, action) metadata on the handler
 * and throws 403 if the authenticated user's role does not satisfy it.
 *
 * This guard does NOT apply row-level scoping — that is the responsibility
 * of the service layer via RbacService.withRBAC() or RbacService.buildScope().
 *
 * Apply at controller or handler level:
 *
 *   @UseGuards(RbacGuard)
 *   @RequirePermission(RbacResource.LEAD, RbacAction.DELETE)
 *   @Delete(':id')
 *   remove() { ... }
 *
 * Or register globally in AppModule providers to gate every route
 * (only routes decorated with @RequirePermission are affected).
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermission on this route — allow through (JwtAuthGuard still applies)
    if (!permission) return true;

    const { user } = context.switchToHttp().getRequest<{ user: JwtUser }>();

    if (!user) throw new ForbiddenException('Access denied');

    if (!hasPermission(user.role as UserRole, permission.resource, permission.action)) {
      throw new ForbiddenException(
        `Role '${user.role}' cannot '${permission.action}' on '${permission.resource}'`,
      );
    }

    return true;
  }
}
