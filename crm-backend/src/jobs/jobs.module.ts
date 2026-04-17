/**
 * Jobs Module - Registers all BullMQ workers
 * Workers are separate from the queue registration (in CoreModule/QueueModule)
 * because workers consume jobs while queues are used to produce jobs.
 */

/**
 * Jobs Module - Registers all BullMQ workers
 * Workers are separate from queue registration (in CoreModule/QueueModule)
 * because workers consume jobs while queues are used to produce jobs.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailWorker } from './workers/email.worker';
import { NotificationWorker } from './workers/notification.worker';
import { AutomationWorker } from './workers/automation.worker';
import { WebhookWorker } from './workers/webhook.worker';
import { SmsWorker } from './workers/sms.worker';
import { AiEmbeddingWorker } from './workers/ai-embedding.worker';
import { BlockchainWorker } from './workers/blockchain.worker';
// Financial rail workers (non-processor)
import { PaymentProcessingWorker } from './workers/payment-processing.worker';
import { WithdrawalWorker } from './workers/withdrawal.worker';
import { ReconciliationWorker } from './workers/reconciliation.worker';
import { DlqWorker } from './workers/dlq.worker';
// Shared services
import { DlqPublisherService } from './services/dlq-publisher.service';
import { ReconciliationScheduler } from './services/reconciliation.scheduler';
import { AdminRetryController } from './controllers/admin-retry.controller';
// Feature modules
import { AutomationModule } from '../modules/automation/automation.module';
import { AiModule } from '../modules/ai/ai.module';
import { BlockchainModule } from '../modules/blockchain/blockchain.module';
import { PaymentsModule } from '../modules/payments/payments.module';
import { WalletsModule } from '../modules/wallets/wallets.module';
import { DealsModule } from '../modules/deals/deals.module';
// New processors module — replaces BlockchainEventsWorker + TransactionConfirmationWorker
import { ProcessorsModule } from '../processors/processors.module';
import { QUEUE_NAMES } from '../core/queue/queue.constants';
import { DealWonSaga } from '../modules/deals/sagas/deal-won.saga';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.AUTOMATION },
      { name: QUEUE_NAMES.WEBHOOK_OUTBOUND },
      { name: QUEUE_NAMES.SMS },
      { name: QUEUE_NAMES.AI_EMBEDDING },
      { name: QUEUE_NAMES.BLOCKCHAIN },
      // Financial rail
      { name: QUEUE_NAMES.PAYMENT_PROCESSING },
      { name: QUEUE_NAMES.BLOCKCHAIN_EVENTS },
      { name: QUEUE_NAMES.TRANSACTION_CONFIRMATION },
      { name: QUEUE_NAMES.WITHDRAWALS },
      { name: QUEUE_NAMES.RECONCILIATION },
      { name: QUEUE_NAMES.DLQ },
    ),
    AutomationModule,
    AiModule,
    BlockchainModule,
    PaymentsModule,
    WalletsModule,
    DealsModule,
    // ProcessorsModule owns PaymentProcessor + ConfirmationProcessor.
    // These replace the legacy BlockchainEventsWorker and TransactionConfirmationWorker —
    // both are removed from providers below to prevent duplicate @Processor registrations
    // on the same queue.
    ProcessorsModule,
  ],
  controllers: [AdminRetryController],
  providers: [
    // Shared services
    DlqPublisherService,
    ReconciliationScheduler,
    DealWonSaga,
    // General workers
    EmailWorker,
    NotificationWorker,
    AutomationWorker,
    WebhookWorker,
    SmsWorker,
    AiEmbeddingWorker,
    BlockchainWorker,
    // Financial rail workers
    // NOTE: BlockchainEventsWorker and TransactionConfirmationWorker are intentionally
    // omitted — they are superseded by PaymentProcessor and ConfirmationProcessor
    // registered via ProcessorsModule above.
    PaymentProcessingWorker,
    WithdrawalWorker,
    ReconciliationWorker,
    DlqWorker,
  ],
})
export class JobsModule {}
