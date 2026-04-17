/**
 * PaymentAdapter
 *
 * Implements PaymentPort by enqueuing jobs on the payment-processing queue.
 * Isolated from use-cases — swap with a mock in tests.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../../../core/queue/queue.constants';
import { PaymentPort, PaymentIntentRequest } from '../../application/ports/payment.port';

@Injectable()
export class PaymentAdapter implements PaymentPort {
  private readonly logger = new Logger(PaymentAdapter.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.PAYMENT_PROCESSING) private readonly paymentQueue: Queue,
  ) {}

  async enqueuePaymentIntent(request: PaymentIntentRequest): Promise<void> {
    await this.paymentQueue.add(
      'create_intent',
      {
        tenantId:       request.tenantId,
        walletId:       request.walletId,
        amountUsdc:     request.amountUsdc,
        chain:          request.chain,
        idempotencyKey: request.idempotencyKey,
        dealId:         request.dealId,
        metadata:       request.metadata,
      },
      {
        ...QUEUE_JOB_OPTIONS.paymentProcessing,
        // BullMQ deduplication: same deal WON can only create one payment intent
        jobId: `payment-intent-deal-${request.dealId}`,
      },
    );

    this.logger.log(`Payment intent queued for deal: ${request.dealId}`);
  }
}
