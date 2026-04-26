import { SetMetadata } from '@nestjs/common';
import { RbacAction, RbacResource } from '../rbac/rbac.types';

export const PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  resource: RbacResource;
  action: RbacAction;
}

/**
 * Route-level RBAC decorator.  Pair with RbacGuard.
 *
 * @example
 *   @RequirePermission(RbacResource.LEAD, RbacAction.DELETE)
 *   @Delete(':id')
 *   remove(@Param('id') id: string) { ... }
 */
export const RequirePermission = (resource: RbacResource, action: RbacAction) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);
