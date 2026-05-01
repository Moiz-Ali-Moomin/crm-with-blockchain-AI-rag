import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenant-context';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.setupMiddleware();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private setupMiddleware() {
    this.$use(async (params, next) => {
      const ctx = tenantContext.getStore();

      // 👇 Skip tenant enforcement (bootstrap/register flows)
      if (ctx?.skipTenant) {
        return next(params);
      }

      const tenantId = ctx?.tenantId;

      // Models that MUST always be tenant-scoped
      const tenantModels = [
        'User',
        'Pipeline',
        'Stage',
        'Deal',
        'Contact',
        'Company',
      ];

      if (tenantModels.includes(params.model || '')) {
        if (!tenantId) {
          throw new Error('Tenant context is required for this operation.');
        }

        // Inject tenantId automatically
        if (params.action === 'create') {
          params.args.data = {
            ...params.args.data,
            tenantId,
          };
        }

        if (params.action === 'findMany' || params.action === 'findFirst') {
          params.args.where = {
            ...params.args.where,
            tenantId,
          };
        }

        if (params.action === 'update' || params.action === 'delete') {
          params.args.where = {
            ...params.args.where,
            tenantId,
          };
        }
      }

      return next(params);
    });
  }
}
