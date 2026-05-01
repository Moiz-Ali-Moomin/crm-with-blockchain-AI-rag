import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  skipTenant?: boolean;
}

export const tenantContext = new AsyncLocalStorage<TenantContext>();
