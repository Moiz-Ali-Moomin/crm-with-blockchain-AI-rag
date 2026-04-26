import { UserRole } from '@prisma/client';

export { UserRole };

export enum RbacResource {
  LEAD          = 'lead',
  CONTACT       = 'contact',
  DEAL          = 'deal',
  COMPANY       = 'company',
  TASK          = 'task',
  TICKET        = 'ticket',
  ACTIVITY      = 'activity',
  PIPELINE      = 'pipeline',
  USER          = 'user',
  ANALYTICS     = 'analytics',
  COMMUNICATION = 'communication',
  WORKFLOW      = 'workflow',
  WEBHOOK       = 'webhook',
  INTEGRATION   = 'integration',
  BILLING       = 'billing',
  PAYMENT       = 'payment',
  WALLET        = 'wallet',
  AI            = 'ai',
  TENANT        = 'tenant',
}

export enum RbacAction {
  READ   = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

/** Prisma WHERE fragment injected by scopeQuery for row-level isolation */
export type RbacScope = Record<string, unknown>;

export type PermissionMatrix = {
  [role in UserRole]: Partial<Record<RbacResource, RbacAction[]>>;
};
