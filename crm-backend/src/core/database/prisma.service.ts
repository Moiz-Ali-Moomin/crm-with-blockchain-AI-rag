/**
 * Prisma Service with Tenant Isolation via Client Extensions
 *
 * CRITICAL: This extension automatically injects tenantId into every
 * query, preventing accidental cross-tenant data access.
 * The tenantId is read from AsyncLocalStorage (set by TenantContextMiddleware).
 *
 * Uses Prisma Client Extensions ($extends) — replaces deprecated $use middleware.
 *
 * Fail-safe design:
 * - Queries against TENANT_SCOPED_MODELS without an active tenant context throw
 *   ForbiddenError unless wrapped in withoutTenantScope().
 * - findUnique on scoped models is transparently redirected to findFirst with
 *   tenantId injected, because {id, tenantId} is not a composite unique key.
 *
 * Models excluded from tenant scoping (UNSCOPED_MODELS):
 * - Tenant (the root entity itself)
 * - BillingInfo
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { tenantContext } from '../../common/middleware/tenant-context.middleware';
import { ForbiddenError } from '../../shared/errors/domain.errors';

// Models that are never tenant-scoped (root or billing entities)
const UNSCOPED_MODELS = new Set(['Tenant', 'BillingInfo']);

// All other models require a tenant context for every query.
// If a scoped model is queried without context, a ForbiddenError is thrown
// unless the call is wrapped in withoutTenantScope().
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'RefreshSession',
  'Lead',
  'Contact',
  'Company',
  'Pipeline',
  'Stage',
  'Deal',
  'DealStageHistory',
  'Activity',
  'Task',
  'Communication',
  'EmailTemplate',
  'Ticket',
  'TicketReply',
  'Workflow',
  'WorkflowExecution',
  'Notification',
  'WebhookConfig',
  'WebhookDelivery',
  'Integration',
  'AiEmbedding',
  'BlockchainRecord',
  'Wallet',
  'Payment',
  'PaymentEvent',
  'LedgerAccount',
  'LedgerEntry',
  'BlockchainTransaction',
  'AuditLog',
]);

// findFirstOrThrow added over the original set to cover the throwing variant
const READ_OPS  = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy']);
const WRITE_OPS = new Set(['update', 'delete', 'updateMany', 'deleteMany']);

function resolveContext() {
  const store = tenantContext.getStore();
  return {
    tenantId: store?.tenantId ?? null,
    bypass: store?.bypassScope ?? false,
  };
}

function guardScoped(model: string, operation: string, tenantId: string | null, bypass: boolean) {
  if (!bypass && TENANT_SCOPED_MODELS.has(model) && !tenantId) {
    throw new ForbiddenError(
      `Tenant context is required for ${model}.${operation}. ` +
      `Wrap in withoutTenantScope() if this is an intentional cross-tenant operation.`,
    );
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      (this as any).$on('query', (e: Prisma.QueryEvent) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query.substring(0, 200)}`);
        }
      });
    }

    // Tenant isolation via Prisma Client Extensions ($extends replaces deprecated $use)
    const extended = (this as any).$extends({
      query: {
        $allModels: {
          /**
           * findUnique on tenant-scoped models is converted to findFirst with
           * tenantId injected. Prisma rejects extra fields in findUnique's where
           * clause when they are not part of the unique constraint, so we must
           * redirect to findFirst to maintain safety.
           * `this` is the model delegate in a Prisma query extension handler.
           */
          async findUnique({ model, args, query }: any) {
            const { tenantId, bypass } = resolveContext();

            if (bypass || UNSCOPED_MODELS.has(model ?? '')) return query(args);

            if (TENANT_SCOPED_MODELS.has(model ?? '')) {
              guardScoped(model, 'findUnique', tenantId, bypass);
              return (this as any).findFirst({
                ...args,
                where: { ...(args.where ?? {}), tenantId },
              });
            }

            return query(args);
          },

          /** findUniqueOrThrow — same redirect pattern as findUnique. */
          async findUniqueOrThrow({ model, args, query }: any) {
            const { tenantId, bypass } = resolveContext();

            if (bypass || UNSCOPED_MODELS.has(model ?? '')) return query(args);

            if (TENANT_SCOPED_MODELS.has(model ?? '')) {
              guardScoped(model, 'findUniqueOrThrow', tenantId, bypass);
              return (this as any).findFirstOrThrow({
                ...args,
                where: { ...(args.where ?? {}), tenantId },
              });
            }

            return query(args);
          },

          /** All other operations — runs for every operation except findUnique/findUniqueOrThrow. */
          $allOperations({ model, operation, args, query }: {
            model: string;
            operation: string;
            args: Record<string, any>;
            query: (args: Record<string, any>) => Promise<unknown>;
          }) {
            const { tenantId, bypass } = resolveContext();

            if (bypass || UNSCOPED_MODELS.has(model ?? '')) return query(args);

            // Fail-safe: reject scoped model queries with no tenant context
            guardScoped(model, operation, tenantId, bypass);

            // No tenant context but model is not scoped (shouldn't happen given above sets)
            if (!tenantId) return query(args);

            if (READ_OPS.has(operation)) {
              args = { ...args, where: { ...args.where, tenantId } };
            } else if (operation === 'create') {
              args = { ...args, data: { ...args.data, tenantId } };
            } else if (operation === 'createMany') {
              args = {
                ...args,
                data: (args.data as Record<string, unknown>[]).map((item) => ({ ...item, tenantId })),
              };
            } else if (WRITE_OPS.has(operation)) {
              // Scopes UPDATE/DELETE to the owning tenant — prevents cross-tenant mutations
              args = { ...args, where: { ...args.where, tenantId } };
            }

            return query(args);
          },
        },
      },
    });

    // Copy extended model delegates onto this instance.
    // Class methods (onModuleInit, withoutTenantScope, etc.) remain on the prototype.
    return Object.assign(this, extended) as this;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Execute a query without tenant scoping.
   * Required for all auth-layer operations (login, token rotation, password reset)
   * and any super-admin cross-tenant query.
   */
  async withoutTenantScope<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ tenantId: null as any, bypassScope: true }, fn);
  }
}
