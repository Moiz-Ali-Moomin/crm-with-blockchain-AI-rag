import { UserRole } from '@prisma/client';
import { JwtUser } from '../decorators/current-user.decorator';
import { RbacResource, RbacScope } from './rbac.types';

/**
 * Returns a Prisma WHERE fragment that enforces row-level ownership.
 *
 * The tenantId is already injected globally by PrismaService's $extends
 * middleware — this layer adds the per-user ownership constraint on top.
 *
 * Currently only SALES_REP gets a non-empty scope; every other role
 * (including SUPPORT_AGENT) sees the full tenant dataset for their resource.
 *
 * IMPORTANT — merging with caller WHERE clauses:
 *   For resources that return an OR scope (lead, task, ticket), do NOT spread
 *   the scope into a WHERE that already contains a top-level OR key, or the
 *   outer OR will be overwritten.  Wrap both in an AND array instead:
 *
 *     where: { AND: [existingFilters, scope] }
 *
 *   For all other resources the returned object is flat ({ownerId: ...} /
 *   {assigneeId: ...}) and safe to spread directly.
 */
export function scopeQuery(user: JwtUser, resource: RbacResource): RbacScope {
  // Only SALES_REP is row-scoped.  All other roles (including SUPPORT_AGENT
  // who owns tickets) see every row within the tenant.
  if ((user.role as UserRole) !== UserRole.SALES_REP) {
    return {};
  }

  switch (resource) {
    // Records where the rep is either the assignee OR the creator
    case RbacResource.LEAD:
    case RbacResource.TASK:
    case RbacResource.TICKET:
      return {
        OR: [
          { assigneeId: user.id },
          { createdById: user.id },
        ],
      };

    // Contacts are exclusively assignee-owned
    case RbacResource.CONTACT:
      return { assigneeId: user.id };

    // Deals and companies use ownerId
    case RbacResource.DEAL:
    case RbacResource.COMPANY:
      return { ownerId: user.id };

    // Activities are always authored by the creator
    case RbacResource.ACTIVITY:
      return { createdById: user.id };

    // All other resources (pipeline, analytics, ai, …) are not row-scoped
    default:
      return {};
  }
}

/**
 * Returns true when the given scope imposes row-level restrictions.
 * Useful for logging / audit notes.
 */
export function isScopedQuery(scope: RbacScope): boolean {
  return Object.keys(scope).length > 0;
}
