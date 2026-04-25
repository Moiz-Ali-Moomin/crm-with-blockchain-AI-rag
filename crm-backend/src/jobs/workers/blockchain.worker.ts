/**
 * BlockchainWorker
 *
 * Processes the `blockchain` BullMQ queue.
 * Triggered by deals.service.ts when a deal is marked WON.
 *
 * Flow:
 * 1. Receive job payload (tenantId, dealId, pre-computed hash)
 * 2. Create PENDING DB record (idempotent — upsert)
 * 3. Submit transaction to EVM chain via ethers.js
 * 4. Wait for 1 confirmation
 * 5. Update DB record to CONFIRMED with txHash + blockNumber
 *
 * On failure:
 * - BullMQ retries with exponential backoff (6 attempts configured)
 * - After all retries exhausted, record stays FAILED — ops team can retry manually
 * - Error details written to `blockchain_records.error` for debugging
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '../../core/queue/queue.constants';
import { BlockchainService } from '../../modules/blockchain/blockchain.service';
import { BlockchainRepository } from '../../modules/blockchain/blockchain.repository';
import { BlockchainJobPayload } from '../../modules/blockchain/blockchain.dto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
@Processor(QUEUE_NAMES.BLOCKCHAIN, { concurrency: 1 } as any)
export class BlockchainWorker extends WorkerHost {
  private readonly logger = new Logger(BlockchainWorker.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly blockchainRepo: BlockchainRepository,
  ) {
    super();
  }

  async process(job: Job<BlockchainJobPayload>): Promise<void> {
    const { tenantId, entityType, entityId, dataHash } = job.data;

    this.logger.log(
      `Processing blockchain job for ${entityType}/${entityId} (tenant: ${tenantId}) [job ${job.id}]`,
    );

    // Step 1: Upsert PENDING record (idempotent — safe to re-run on retry)
    // network read from BlockchainService which reads BLOCKCHAIN_NETWORK env var
    const record = await this.blockchainRepo.upsert({
      tenantId,
      entityType,
      entityId,
      dataHash,
      network: this.blockchainService.network,
    });

    // Step 2: Submit to chain + wait for confirmation
    try {
      await this.blockchainService.registerOnChain(
        record.id,
        tenantId,
        entityId,
        dataHash,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Blockchain registration failed for ${entityType}/${entityId}: ${message}`,
      );
      // Write failure reason to DB — but rethrow so BullMQ retries
      await this.blockchainRepo.fail(record.id, message);
      throw err;
    }
  }
}
