/**
 * DealsModule
 *
 * Production-grade NestJS module wiring for the Deals bounded context.
 *
 * Architecture:
 *   Controllers (interface) → Use-Cases (application) → Ports (interfaces)
 *                                                            ↓
 *                                                  Infrastructure Adapters
 *                                                  (Prisma, BullMQ, etc.)
 *
 * Dependency inversion is achieved via NestJS DI tokens (Symbols).
 * Swap any { useClass } with a mock to unit-test use-cases in isolation.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

// ── Port tokens ──────────────────────────────────────────────────────────────
import { DEAL_REPOSITORY_PORT }  from './application/ports/deal.repository.port';
import { EVENT_PUBLISHER_PORT }  from './application/ports/event-publisher.port';
import { BLOCKCHAIN_PORT }       from './application/ports/blockchain.port';
import { WALLET_PORT }           from './application/ports/wallet.port';
import { PAYMENT_PORT }          from './application/ports/payment.port';

// ── Use-Cases ────────────────────────────────────────────────────────────────
import { CreateDealUseCase }     from './application/use-cases/create-deal.use-case';
import { MoveDealStageUseCase }  from './application/use-cases/move-deal-stage.use-case';
import { UpdateDealUseCase }     from './application/use-cases/update-deal.use-case';
import { DeleteDealUseCase }     from './application/use-cases/delete-deal.use-case';
import { GetKanbanBoardQuery, GetForecastQuery } from './application/queries/deal.queries';

// ── Infrastructure adapters ──────────────────────────────────────────────────
import { PrismaDealRepository }  from './infrastructure/repositories/prisma-deal.repository';
import { BullMqEventPublisher }  from './infrastructure/adapters/bullmq-event-publisher';
import { BlockchainAdapter }     from './infrastructure/adapters/blockchain.adapter';
import { WalletAdapter }         from './infrastructure/adapters/wallet.adapter';
import { PaymentAdapter }        from './infrastructure/adapters/payment.adapter';

// ── Interface layer ──────────────────────────────────────────────────────────
import { DealsControllerV1 }     from './interface/deals.controller.v1';

// ── Backward-compat facade ───────────────────────────────────────────────────
import { DealsService }          from './deals.service';

// ── External module dependencies ─────────────────────────────────────────────
import { BlockchainModule }      from '../blockchain/blockchain.module';
import { WalletsModule }         from '../wallets/wallets.module';
import { QUEUE_NAMES }           from '../../core/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.AUTOMATION },
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.WEBHOOK_OUTBOUND },
      { name: QUEUE_NAMES.BLOCKCHAIN },
      { name: QUEUE_NAMES.PAYMENT_PROCESSING },
    ),
    BlockchainModule,
    WalletsModule,
  ],

  controllers: [
    DealsControllerV1,
  ],

  providers: [
    // ── Use-Cases ─────────────────────────────────────────────────────────
    CreateDealUseCase,
    MoveDealStageUseCase,
    UpdateDealUseCase,
    DeleteDealUseCase,
    GetKanbanBoardQuery,
    GetForecastQuery,

    // ── Port → Adapter Bindings (Dependency Inversion) ────────────────────
    // To swap in tests: override { provide: DEAL_REPOSITORY_PORT, useClass: InMemoryDealRepo }
    { provide: DEAL_REPOSITORY_PORT, useClass: PrismaDealRepository },
    { provide: EVENT_PUBLISHER_PORT, useClass: BullMqEventPublisher },
    { provide: BLOCKCHAIN_PORT,      useClass: BlockchainAdapter },
    { provide: WALLET_PORT,          useClass: WalletAdapter },
    { provide: PAYMENT_PORT,         useClass: PaymentAdapter },

    // ── Backward-Compatibility Facade ─────────────────────────────────────
    // @deprecated — migrate importers to inject use-cases directly
    DealsService,
  ],

  exports: [
    // Export use-cases individually (preferred)
    CreateDealUseCase,
    MoveDealStageUseCase,
    UpdateDealUseCase,
    DeleteDealUseCase,
    GetKanbanBoardQuery,
    GetForecastQuery,
    DEAL_REPOSITORY_PORT,

    // Export facade for backward compat
    DealsService,
  ],
})
export class DealsModule {}
