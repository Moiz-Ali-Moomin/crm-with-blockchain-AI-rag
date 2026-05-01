import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';
import { tenantContext } from './tenant-context';

type PrismaTransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    fn: (tx: PrismaTransactionClient) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T> {
    return this.prisma.$transaction(fn, {
      timeout: options?.timeout ?? 10000,
      maxWait: options?.maxWait ?? 5000,
    });
  }

  // 🔥 CRITICAL: bypass tenant enforcement (used in register)
  async withoutTenantScope<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ skipTenant: true }, fn);
  }

  // Optional helper (useful later)
  async withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ tenantId }, fn);
  }
}