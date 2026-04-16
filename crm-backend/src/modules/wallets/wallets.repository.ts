import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Chain, Prisma, Wallet, WalletStatus, WalletType } from '@prisma/client';

export interface CreateWalletInput {
  tenantId: string;
  userId?: string;
  type: WalletType;
  chain: Chain;
  address: string;
  custodyId?: string;
  custodyProvider: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateWalletInput): Promise<Wallet> {
    return this.prisma.wallet.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        chain: input.chain,
        address: input.address,
        custodyId: input.custodyId,
        custodyProvider: input.custodyProvider,
        label: input.label,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
  }

  findById(id: string, tenantId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: { id, tenantId },
    });
  }

  findByAddress(address: string, chain: Chain): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: { address: { equals: address, mode: 'insensitive' }, chain },
    });
  }

  findByTenant(tenantId: string, type?: WalletType): Promise<Wallet[]> {
    return this.prisma.wallet.findMany({
      where: { tenantId, ...(type && { type }), status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  findTenantOperatingWallet(tenantId: string, chain: Chain): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: { tenantId, type: 'TENANT', chain, status: 'ACTIVE' },
    });
  }

  updateBalanceCache(
    id: string,
    balanceUsdc: string,
  ): Promise<Wallet> {
    return this.prisma.wallet.update({
      where: { id },
      data: {
        balanceUsdc: new Prisma.Decimal(balanceUsdc).div(new Prisma.Decimal('1000000')),
        balanceSyncedAt: new Date(),
      },
    });
  }

  suspend(id: string, _tenantId: string): Promise<Wallet> {
    return this.prisma.wallet.update({
      where: { id },
      data: { status: WalletStatus.SUSPENDED },
    });
  }
}
