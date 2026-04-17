/**
 * ProcessorsModule
 *
 * Registers the financial-rail BullMQ processors that own the USDC payment lifecycle:
 *
 *   PaymentProcessor        — blockchain-events queue
 *     Matches Transfer events to PENDING payment intents → CONFIRMING
 *
 *   ConfirmationProcessor   — transaction-confirmation queue
 *     Polls block confirmations → CONFIRMED + ledger settlement, or FAILED
 *
 * This module replaces the legacy BlockchainEventsWorker and
 * TransactionConfirmationWorker from JobsModule. Both processors use the
 * same queue names with the same idempotency guarantees — the replacement is
 * drop-in with no queue migration needed.
 *
 * DlqPublisherService is provided here directly (not imported from JobsModule)
 * because it has no singleton state and NestJS DI requires providers to be
 * declared in the module that uses them or in a globally-imported module.
 *
 * Import this module from JobsModule — NOT from AppModule — because workers
 * must share the same Redis connection lifecycle as the rest of JobsModule.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PaymentProcessor }      from './payment.processor';
import { ConfirmationProcessor } from './confirmation.processor';
import { DlqPublisherService }   from '../jobs/services/dlq-publisher.service';
import { EthereumPaymentModule } from '../blockchain/blockchain.module';
import { PaymentsModule }        from '../modules/payments/payments.module';
import { QUEUE_NAMES }           from '../core/queue/queue.constants';

@Module({
  imports: [
    ConfigModule,

    // Queue registrations — workers need access to produce follow-on jobs
    BullModule.registerQueue(
      { name: QUEUE_NAMES.BLOCKCHAIN_EVENTS },
      { name: QUEUE_NAMES.TRANSACTION_CONFIRMATION },
      { name: QUEUE_NAMES.DLQ },
    ),

    // PaymentProcessor needs UsdcContractService for amount formatting / encoding
    EthereumPaymentModule,

    // Both processors need PaymentsService for state transitions
    PaymentsModule,
  ],
  providers: [
    PaymentProcessor,
    ConfirmationProcessor,
    // DlqPublisherService is stateless — safe to provide per-module
    DlqPublisherService,
  ],
})
export class ProcessorsModule {}
