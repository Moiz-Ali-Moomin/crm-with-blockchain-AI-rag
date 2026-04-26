import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtUser } from '../decorators/current-user.decorator';
import { ForbiddenError } from '../../shared/errors/domain.errors';
import { hasPermission } from './rbac.permissions';
import { scopeQuery, isScopedQuery } from './rbac.scope';
import { RbacAction, RbacResource, RbacScope } from './rbac.types';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  /**
   * checkPermission
   *
   * Throws ForbiddenError if the user's role does not have the required
   * action on the given resource.  Call this at the top of service methods
   * when you don't need a Prisma scope (e.g. create, delete by ID).
   */
  checkPermission(user: JwtUser, resource: RbacResource, action: RbacAction): void {
    if (!hasPermission(user.role as UserRole, resource, action)) {
      throw new ForbiddenError(
        `Role '${user.role}' is not permitted to perform '${action}' on '${resource}'`,
      );
    }
  }

  /**
   * buildScope
   *
   * Returns the Prisma WHERE fragment for row-level isolation without running
   * a query.  Useful when the caller needs to compose the scope with other
   * filters before hitting the repository.
   *
   * Does NOT check permissions — call checkPermission first.
   */
  buildScope(user: JwtUser, resource: RbacResource): RbacScope {
    const scope = scopeQuery(user, resource);

    if (isScopedQuery(scope)) {
      this.logger.debug(
        `Row-level scope applied for ${user.role} on ${resource}: ${JSON.stringify(scope)}`,
      );
    }

    return scope;
  }

  /**
   * withRBAC
   *
   * The primary entry-point for RBAC-protected queries.
   *
   * 1. Asserts the user has the required permission (throws ForbiddenError if not).
   * 2. Computes the row-level scope (empty {} for non-scoped roles).
   * 3. Calls the provided query factory with the scope and returns its result.
   *
   * Usage:
   *
   *   // READ — pass scope to findMany
   *   return this.rbacService.withRBAC(user, RbacResource.LEAD, RbacAction.READ,
   *     (scope) => this.leadsRepo.findAll(filters, scope)
   *   );
   *
   *   // CREATE — scope is always {} here; just use for permission check
   *   return this.rbacService.withRBAC(user, RbacResource.LEAD, RbacAction.CREATE,
   *     () => this.leadsRepo.create({ ...dto, createdById: user.id })
   *   );
   *
   *   // UPDATE / DELETE — pass scope to WHERE so SALES_REP can only touch own records
   *   return this.rbacService.withRBAC(user, RbacResource.LEAD, RbacAction.UPDATE,
   *     (scope) => this.leadsRepo.update(id, dto, scope)
   *   );
   *
   * Note on scope merging:
   *   Spread `scope` directly when it contains flat keys (ownerId, assigneeId, etc.).
   *   For resources that return an OR scope (lead, task, ticket) and your WHERE
   *   already has a top-level OR, wrap both in AND:
   *     where: { AND: [existingFilters, scope] }
   */
  async withRBAC<T>(
    user: JwtUser,
    resource: RbacResource,
    action: RbacAction,
    query: (scope: RbacScope) => Promise<T>,
  ): Promise<T> {
    this.checkPermission(user, resource, action);
    const scope = this.buildScope(user, resource);
    return query(scope);
  }
}
