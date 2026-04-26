/**
 * RbacPolicyService
 *
 * Serves the introspection API (GET /rbac/roles, GET /rbac/my-permissions).
 * Not the enforcement layer — use RbacService (src/common/rbac) for that.
 */

import { Injectable } from '@nestjs/common';
import { RoleDefinition, Permission, PermissionsResult } from './rbac.dto';

// Role hierarchy levels — higher number = more authority
const ROLE_LEVELS: Record<string, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  SALES_MANAGER: 60,
  SALES_REP: 40,
  SUPPORT_AGENT: 30,
  VIEWER: 10,
};

const ALL_ACTIONS = ['create', 'read', 'update', 'delete'];
const READ_ONLY = ['read'];

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: [
    { resource: 'users', actions: ALL_ACTIONS },
    { resource: 'billing', actions: ALL_ACTIONS },
    { resource: 'integrations', actions: ALL_ACTIONS },
    { resource: 'webhooks', actions: ALL_ACTIONS },
    { resource: 'tenant', actions: ALL_ACTIONS },
    { resource: 'leads', actions: ALL_ACTIONS },
    { resource: 'contacts', actions: ALL_ACTIONS },
    { resource: 'deals', actions: ALL_ACTIONS },
    { resource: 'companies', actions: ALL_ACTIONS },
    { resource: 'tickets', actions: ALL_ACTIONS },
    { resource: 'tasks', actions: ALL_ACTIONS },
    { resource: 'activities', actions: ALL_ACTIONS },
    { resource: 'analytics', actions: ALL_ACTIONS },
    { resource: 'automation', actions: ALL_ACTIONS },
    { resource: 'pipelines', actions: ALL_ACTIONS },
    { resource: 'rbac', actions: ALL_ACTIONS },
  ],
  ADMIN: [
    { resource: 'users', actions: ALL_ACTIONS },
    { resource: 'billing', actions: READ_ONLY },
    { resource: 'integrations', actions: ALL_ACTIONS },
    { resource: 'webhooks', actions: ALL_ACTIONS },
    { resource: 'tenant', actions: ['read', 'update'] },
    { resource: 'leads', actions: ALL_ACTIONS },
    { resource: 'contacts', actions: ALL_ACTIONS },
    { resource: 'deals', actions: ALL_ACTIONS },
    { resource: 'companies', actions: ALL_ACTIONS },
    { resource: 'tickets', actions: ALL_ACTIONS },
    { resource: 'tasks', actions: ALL_ACTIONS },
    { resource: 'activities', actions: ALL_ACTIONS },
    { resource: 'analytics', actions: ALL_ACTIONS },
    { resource: 'automation', actions: ALL_ACTIONS },
    { resource: 'pipelines', actions: ALL_ACTIONS },
    { resource: 'rbac', actions: READ_ONLY },
  ],
  SALES_MANAGER: [
    { resource: 'users', actions: ['read', 'update'] },
    { resource: 'leads', actions: ALL_ACTIONS },
    { resource: 'contacts', actions: ALL_ACTIONS },
    { resource: 'deals', actions: ALL_ACTIONS },
    { resource: 'companies', actions: ALL_ACTIONS },
    { resource: 'tickets', actions: READ_ONLY },
    { resource: 'tasks', actions: ALL_ACTIONS },
    { resource: 'activities', actions: ALL_ACTIONS },
    { resource: 'analytics', actions: READ_ONLY },
    { resource: 'automation', actions: READ_ONLY },
    { resource: 'pipelines', actions: ['read', 'update'] },
  ],
  SALES_REP: [
    { resource: 'leads', actions: ALL_ACTIONS },
    { resource: 'contacts', actions: ALL_ACTIONS },
    { resource: 'deals', actions: ALL_ACTIONS },
    { resource: 'companies', actions: ['read', 'create', 'update'] },
    { resource: 'tasks', actions: ALL_ACTIONS },
    { resource: 'activities', actions: ['create', 'read', 'update'] },
    { resource: 'tickets', actions: READ_ONLY },
    { resource: 'analytics', actions: READ_ONLY },
    { resource: 'pipelines', actions: READ_ONLY },
  ],
  SUPPORT_AGENT: [
    { resource: 'tickets', actions: ALL_ACTIONS },
    { resource: 'contacts', actions: ['read', 'update'] },
    { resource: 'activities', actions: ['create', 'read'] },
    { resource: 'leads', actions: READ_ONLY },
    { resource: 'deals', actions: READ_ONLY },
    { resource: 'companies', actions: READ_ONLY },
    { resource: 'tasks', actions: ['create', 'read', 'update'] },
  ],
  VIEWER: [
    { resource: 'leads', actions: READ_ONLY },
    { resource: 'contacts', actions: READ_ONLY },
    { resource: 'deals', actions: READ_ONLY },
    { resource: 'companies', actions: READ_ONLY },
    { resource: 'tickets', actions: READ_ONLY },
    { resource: 'tasks', actions: READ_ONLY },
    { resource: 'activities', actions: READ_ONLY },
    { resource: 'analytics', actions: READ_ONLY },
    { resource: 'pipelines', actions: READ_ONLY },
  ],
};

const ROLE_METADATA: Record<string, { displayName: string; description: string }> = {
  SUPER_ADMIN: {
    displayName: 'Super Admin',
    description: 'Full platform access including system settings and all tenants',
  },
  ADMIN: {
    displayName: 'Admin',
    description: 'Full access within the tenant including user management and billing visibility',
  },
  SALES_MANAGER: {
    displayName: 'Sales Manager',
    description: 'Manage leads, deals, and sales team members; view analytics',
  },
  SALES_REP: {
    displayName: 'Sales Representative',
    description: 'Create and manage own leads, contacts, and deals',
  },
  SUPPORT_AGENT: {
    displayName: 'Support Agent',
    description: 'Manage support tickets and view contact information',
  },
  VIEWER: {
    displayName: 'Viewer',
    description: 'Read-only access to all CRM resources',
  },
};

@Injectable()
export class RbacPolicyService {
  getRoles(): RoleDefinition[] {
    return Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({
      role,
      displayName: ROLE_METADATA[role].displayName,
      description: ROLE_METADATA[role].description,
      level: ROLE_LEVELS[role] ?? 0,
      permissions,
    }));
  }

  hasPermission(role: string, resource: string, action: string): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    if (!permissions) return false;

    const resourcePerm = permissions.find((p) => p.resource === resource);
    if (!resourcePerm) return false;

    return resourcePerm.actions.includes(action);
  }

  canManageUser(actorRole: string, targetRole: string): boolean {
    const actorLevel = ROLE_LEVELS[actorRole] ?? 0;
    const targetLevel = ROLE_LEVELS[targetRole] ?? 0;
    return actorLevel > targetLevel;
  }

  getPermissionsForRole(role: string): PermissionsResult {
    const permissions = ROLE_PERMISSIONS[role] ?? [];

    // Roles this role can manage (roles with lower level)
    const actorLevel = ROLE_LEVELS[role] ?? 0;
    const canManage = Object.entries(ROLE_LEVELS)
      .filter(([, level]) => level < actorLevel)
      .map(([r]) => r);

    return { role, permissions, canManage };
  }
}
