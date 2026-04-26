import { UserRole } from '@prisma/client';
import { RbacAction, RbacResource, PermissionMatrix } from './rbac.types';

const { READ, CREATE, UPDATE, DELETE } = RbacAction;
const ALL = [READ, CREATE, UPDATE, DELETE];
const READ_WRITE = [READ, CREATE, UPDATE];

/**
 * Centralized permission matrix.
 *
 * Rules:
 * - SUPER_ADMIN: bypasses this map entirely (checked in hasPermission)
 * - ADMIN: full control within their tenant; cannot manage platform-level billing
 * - SALES_MANAGER: full CRM CRUD + read-only on admin resources; no tenant/integration changes
 * - SALES_REP: CRM CRUD scoped to own records (scopeQuery enforces row-level isolation)
 * - SUPPORT_AGENT: ticket-centric; read-only on deals/leads/companies
 * - VIEWER: read-only on all CRM data
 */
export const PERMISSION_MATRIX: PermissionMatrix = {
  [UserRole.SUPER_ADMIN]: {}, // never consulted — hasPermission returns true immediately

  [UserRole.ADMIN]: {
    [RbacResource.LEAD]:          ALL,
    [RbacResource.CONTACT]:       ALL,
    [RbacResource.DEAL]:          ALL,
    [RbacResource.COMPANY]:       ALL,
    [RbacResource.TASK]:          ALL,
    [RbacResource.TICKET]:        ALL,
    [RbacResource.ACTIVITY]:      ALL,
    [RbacResource.PIPELINE]:      ALL,
    [RbacResource.USER]:          ALL,
    [RbacResource.ANALYTICS]:     [READ],
    [RbacResource.COMMUNICATION]: ALL,
    [RbacResource.WORKFLOW]:      ALL,
    [RbacResource.WEBHOOK]:       ALL,
    [RbacResource.INTEGRATION]:   ALL,
    [RbacResource.BILLING]:       [READ, UPDATE],
    [RbacResource.PAYMENT]:       [READ],
    [RbacResource.WALLET]:        [READ],
    [RbacResource.AI]:            ALL,
    [RbacResource.TENANT]:        [READ, UPDATE],
  },

  [UserRole.SALES_MANAGER]: {
    [RbacResource.LEAD]:          ALL,
    [RbacResource.CONTACT]:       ALL,
    [RbacResource.DEAL]:          ALL,
    [RbacResource.COMPANY]:       ALL,
    [RbacResource.TASK]:          ALL,
    [RbacResource.TICKET]:        ALL,
    [RbacResource.ACTIVITY]:      ALL,
    [RbacResource.PIPELINE]:      READ_WRITE,
    [RbacResource.USER]:          [READ],
    [RbacResource.ANALYTICS]:     [READ],
    [RbacResource.COMMUNICATION]: READ_WRITE,
    [RbacResource.WORKFLOW]:      READ_WRITE,
    [RbacResource.WEBHOOK]:       [READ],
    [RbacResource.INTEGRATION]:   [READ],
    [RbacResource.BILLING]:       [READ],
    [RbacResource.PAYMENT]:       [READ],
    [RbacResource.WALLET]:        [READ],
    [RbacResource.AI]:            READ_WRITE,
    // no TENANT access
  },

  // Row-level scope (ownerId / assigneeId) is enforced by scopeQuery — not here.
  [UserRole.SALES_REP]: {
    [RbacResource.LEAD]:          ALL,
    [RbacResource.CONTACT]:       ALL,
    [RbacResource.DEAL]:          ALL,
    [RbacResource.COMPANY]:       READ_WRITE,
    [RbacResource.TASK]:          ALL,
    [RbacResource.TICKET]:        READ_WRITE,
    [RbacResource.ACTIVITY]:      [READ, CREATE],
    [RbacResource.PIPELINE]:      [READ],
    [RbacResource.USER]:          [READ],
    [RbacResource.ANALYTICS]:     [READ],
    [RbacResource.COMMUNICATION]: [READ, CREATE],
    [RbacResource.AI]:            [READ, CREATE],
    // no WORKFLOW, WEBHOOK, INTEGRATION, BILLING, TENANT
  },

  [UserRole.SUPPORT_AGENT]: {
    [RbacResource.TICKET]:        ALL,
    [RbacResource.CONTACT]:       [READ, UPDATE],
    [RbacResource.LEAD]:          [READ],
    [RbacResource.DEAL]:          [READ],
    [RbacResource.COMPANY]:       [READ],
    [RbacResource.TASK]:          READ_WRITE,
    [RbacResource.ACTIVITY]:      [READ, CREATE],
    [RbacResource.COMMUNICATION]: [READ, CREATE],
    [RbacResource.PIPELINE]:      [READ],
    [RbacResource.ANALYTICS]:     [READ],
    [RbacResource.AI]:            [READ, CREATE],
    // no USER, WORKFLOW, WEBHOOK, INTEGRATION, BILLING, TENANT
  },

  [UserRole.VIEWER]: {
    [RbacResource.LEAD]:          [READ],
    [RbacResource.CONTACT]:       [READ],
    [RbacResource.DEAL]:          [READ],
    [RbacResource.COMPANY]:       [READ],
    [RbacResource.TASK]:          [READ],
    [RbacResource.TICKET]:        [READ],
    [RbacResource.ACTIVITY]:      [READ],
    [RbacResource.PIPELINE]:      [READ],
    [RbacResource.ANALYTICS]:     [READ],
    [RbacResource.COMMUNICATION]: [READ],
    [RbacResource.AI]:            [READ],
    // no writes; no admin resources
  },
};

/**
 * O(1) permission check.  SUPER_ADMIN always passes.
 */
export function hasPermission(
  role: UserRole,
  resource: RbacResource,
  action: RbacAction,
): boolean {
  if (role === UserRole.SUPER_ADMIN) return true;
  return PERMISSION_MATRIX[role]?.[resource]?.includes(action) ?? false;
}
