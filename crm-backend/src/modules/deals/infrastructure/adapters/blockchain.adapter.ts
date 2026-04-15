/**
 * BlockchainAdapter
 *
 * Implements BlockchainPort for the Deals module.
 * Delegates hash computation to BlockchainService (pure) and
 * registration to the blockchain BullMQ queue.
 *
 * Use-cases depend on BlockchainPort — never on this adapter directly.
 * Swap this class in tests with a mock that records calls.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BlockchainService } from '../../../blockchain/blockchain.service';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../../../core/queue/queue.constants';
import {
  BlockchainPort,
  DealHashPayload,
  BlockchainRegistrationPayload,
} from '../../application/ports/blockchain.port';

@Injectable()
export class BlockchainAdapter implements BlockchainPort {
  private readonly logger = new Logger(BlockchainAdapter.name);

  constructor(
    private readonly blockchainService: BlockchainService,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN) private readonly blockchainQueue: Queue,
  ) {}

  computeDealHash(payload: DealHashPayload): string {
    return this.blockchainService.computeDealHash(payload);
  }

  async enqueueDealRegistration(payload: BlockchainRegistrationPayload): Promise<void> {
    await this.blockchainQueue.add(
      'register',
      {
        tenantId:        payload.tenantId,
        entityType:      payload.entityType,
        entityId:        payload.entityId,
        dataHash:        payload.dataHash,
        payloadSnapshot: payload.payloadSnapshot,
      },
      {
        ...QUEUE_JOB_OPTIONS.blockchain,
        // Idempotent job ID — BullMQ deduplicates concurrent enqueues for same deal
        jobId: `blockchain:deal:${payload.entityId}`,
      },
    );

    this.logger.log(
      `Blockchain job enqueued for deal ${payload.entityId} (hash: ${payload.dataHash.slice(0, 10)}...)`,
    );
  }
}
