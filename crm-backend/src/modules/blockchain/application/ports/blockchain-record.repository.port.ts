/**
 * BlockchainRecordRepositoryPort
 *
 * Interface for all persistence operations on blockchain records.
 * Isolates the application layer from PrismaService.
 */

export const BLOCKCHAIN_RECORD_REPOSITORY_PORT = Symbol('BLOCKCHAIN_RECORD_REPOSITORY_PORT');

export interface BlockchainRecordReadModel {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  dataHash: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  txHash: string | null;
  blockNumber: bigint | null;
  gasUsed: string | null;
  network: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlockchainRecordRepositoryPort {
  findByDeal(tenantId: string, dealId: string): Promise<BlockchainRecordReadModel | null>;

  upsert(data: {
    tenantId: string;
    entityType: string;
    entityId: string;
    dataHash: string;
    network: string;
  }): Promise<BlockchainRecordReadModel>;

  confirm(
    id: string,
    txHash: string,
    blockNumber: bigint,
    gasUsed: string,
  ): Promise<void>;

  fail(id: string, error: string): Promise<void>;
}
