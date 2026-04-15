/**
 * PaymentPort
 *
 * Interface for payment intent creation triggered by the Deals domain.
 * Isolates PaymentsService / payment queue from use-cases.
 */

export const PAYMENT_PORT = Symbol('PAYMENT_PORT');

export interface PaymentIntentRequest {
  tenantId: string;
  walletId: string;
  amountUsdc: string;
  chain: string;
  idempotencyKey: string;
  dealId: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentPort {
  /**
   * Enqueue a payment intent creation job.
   * Non-fatal — callers MUST handle errors without rolling back deal state.
   */
  enqueuePaymentIntent(request: PaymentIntentRequest): Promise<void>;
}
