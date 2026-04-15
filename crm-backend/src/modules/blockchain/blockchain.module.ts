/**
 * BlockchainModule
 *
 * Updated module wiring with DDD/Clean Architecture:
 *   - BlockchainRecordRepositoryPort → PrismaBlockchainRecordRepository
 *   - VerifyDealUseCase and GetBlockchainRecordUseCase as isolated application services
 *   - BlockchainControllerV1 (thin, uses use-cases)
 *   - Legacy BlockchainRepository exported for BlockchainWorker backward-compat
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

// ── Port token ────────────────────────────────────────────────────────────────
import { BLOCKCHAIN_RECORD_REPOSITORY_PORT } from './application/ports/blockchain-record.repository.port';

// ── Use-Cases ─────────────────────────────────────────────────────────────────
import { VerifyDealUseCase, GetBlockchainRecordUseCase } from './application/use-cases/verify-deal.use-case';

// ── Infrastructure ────────────────────────────────────────────────────────────
import { PrismaBlockchainRecordRepository } from './infrastructure/repositories/prisma-blockchain-record.repository';

// ── Interface ─────────────────────────────────────────────────────────────────
import { BlockchainControllerV1 } from './interface/blockchain.controller.v1';

// ── Legacy (keep for BlockchainWorker and BlockchainService internal use) ──────
import { BlockchainService } from './blockchain.service';
import { BlockchainRepository } from './blockchain.repository';
import { BlockchainListenerService } from './listener/blockchain-listener.service';

import { QUEUE_NAMES } from '../../core/queue/queue.constants';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.BLOCKCHAIN },
      { name: QUEUE_NAMES.BLOCKCHAIN_EVENTS },
    ),
  ],

  controllers: [
    BlockchainControllerV1,
  ],

  providers: [
    // ── Use-Cases ──────────────────────────────────────────────────────────
    VerifyDealUseCase,
    GetBlockchainRecordUseCase,

    // ── Port → Adapter Binding ─────────────────────────────────────────────
    { provide: BLOCKCHAIN_RECORD_REPOSITORY_PORT, useClass: PrismaBlockchainRecordRepository },

    // ── Legacy providers (kept for worker compatibility) ───────────────────
    // BlockchainService: used by BlockchainWorker (transaction submission)
    //                    and BlockchainAdapter (hash computation)
    // BlockchainRepository: used by BlockchainWorker directly until refactored
    BlockchainService,
    BlockchainRepository,

    // BlockchainListenerService: long-lived — starts on bootstrap
    BlockchainListenerService,
  ],

  exports: [
    // Export use-cases for cross-module use
    VerifyDealUseCase,
    GetBlockchainRecordUseCase,
    BLOCKCHAIN_RECORD_REPOSITORY_PORT,

    // Export legacy service for BlockchainAdapter in DealsModule
    BlockchainService,

    // Export legacy repo for BlockchainWorker (jobs module)
    BlockchainRepository,

    // Export listener for external consumers
    BlockchainListenerService,

    // Export BullModule so DealsModule can get the queue reference via BlockchainModule
    BullModule,
  ],
})
export class BlockchainModule {}
