/**
 * PrismaBlockchainRecordRepository
 *
 * Implements BlockchainRecordRepositoryPort using Prisma.
 * This is the only file in the blockchain module allowed to import PrismaService.
 *
 * Contains all Prisma logic previously in BlockchainRepository.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  BlockchainRecordRepositoryPort,
  BlockchainRecordReadModel,
} from '../../application/ports/blockchain-record.repository.port';

@Injectable()
export class PrismaBlockchainRecordRepository implements BlockchainRecordRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByDeal(
    tenantId: string,
    dealId: string,
  ): Promise<BlockchainRecordReadModel | null> {
    return this.prisma.blockchainRecord.findFirst({
      where: { tenantId, entityType: 'DEAL', entityId: dealId },
    }) as Promise<BlockchainRecordReadModel | null>;
  }

  async upsert(data: {
    tenantId: string;
    entityType: string;
    entityId: string;
    dataHash: string;
    network: string;
  }): Promise<BlockchainRecordReadModel> {
    return this.prisma.withoutTenantScope(() =>
      this.prisma.blockchainRecord.upsert({
        where: {
          tenantId_entityType_entityId: {
            tenantId:   data.tenantId,
            entityType: data.entityType,
            entityId:   data.entityId,
          },
        },
        create: { ...data, status: 'PENDING' },
        update: { dataHash: data.dataHash, status: 'PENDING', updatedAt: new Date() },
      }),
    ) as Promise<BlockchainRecordReadModel>;
  }

  async confirm(
    id: string,
    txHash: string,
    blockNumber: bigint,
    gasUsed: string,
  ): Promise<void> {
    await this.prisma.withoutTenantScope(() =>
      this.prisma.blockchainRecord.update({
        where: { id },
        data: { status: 'CONFIRMED', txHash, blockNumber, gasUsed, updatedAt: new Date() },
      }),
    );
  }

  async fail(id: string, error: string): Promise<void> {
    await this.prisma.withoutTenantScope(() =>
      this.prisma.blockchainRecord.update({
        where: { id },
        data: { status: 'FAILED', error, updatedAt: new Date() },
      }),
    );
  }
}
