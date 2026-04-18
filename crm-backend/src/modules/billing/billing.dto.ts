/**
 * Billing DTOs
 * Zod schemas for billing and subscription operations
 */

import { z } from 'zod';

const PAID_PLANS = ['starter', 'pro', 'pro_plus', 'ultimate', 'enterprise'] as const;
const ALL_PLANS  = ['free', ...PAID_PLANS] as const;

export const CreateCheckoutSessionSchema = z.object({
  planId: z.enum(ALL_PLANS),
  successUrl: z.string().url('Must be a valid success URL'),
  returnUrl: z.string().url('Must be a valid return URL'),
});
export type CreateCheckoutSessionDto = z.infer<typeof CreateCheckoutSessionSchema>;

export const CreatePayPalSubscriptionSchema = z.object({
  planId: z.enum(PAID_PLANS),
  returnUrl: z.string().url('Must be a valid return URL'),
  cancelUrl: z.string().url('Must be a valid cancel URL'),
});
export type CreatePayPalSubscriptionDto = z.infer<typeof CreatePayPalSubscriptionSchema>;

/** Called after user approves on PayPal — stores the subscription ID and activates */
export const ActivatePayPalSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'PayPal subscription ID is required'),
});
export type ActivatePayPalSubscriptionDto = z.infer<typeof ActivatePayPalSubscriptionSchema>;

/** Upgrade or downgrade an existing PayPal subscription to a new plan */
export const UpdatePayPalPlanSchema = z.object({
  planId: z.enum(PAID_PLANS),
  returnUrl: z.string().url('Must be a valid return URL'),
  cancelUrl: z.string().url('Must be a valid cancel URL'),
});
export type UpdatePayPalPlanDto = z.infer<typeof UpdatePayPalPlanSchema>;

export const CreateCryptoPaymentSchema = z.object({
  planId: z.enum(PAID_PLANS),
  currency: z.enum(['ETH', 'USDC', 'USDT', 'DAI']),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
});
export type CreateCryptoPaymentDto = z.infer<typeof CreateCryptoPaymentSchema>;

/** Admin-only: manually confirm a crypto payment after verifying the tx on-chain */
export const ConfirmCryptoPaymentSchema = z.object({
  tenantId: z.string().uuid('Must be a valid tenant UUID'),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a valid EVM transaction hash'),
});
export type ConfirmCryptoPaymentDto = z.infer<typeof ConfirmCryptoPaymentSchema>;

/** Refund the latest Stripe invoice charge */
export const RefundStripeChargeSchema = z.object({
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
  /** Partial refund amount in USD cents. Omit to refund the full invoice amount. */
  amountCents: z.number().int().positive().optional(),
});
export type RefundStripeChargeDto = z.infer<typeof RefundStripeChargeSchema>;

// ── Razorpay ─────────────────────────────────────────────────────────────────

/** Step 1: Create a Razorpay subscription and get the subscription_id for checkout */
export const CreateRazorpaySubscriptionSchema = z.object({
  planId: z.enum(PAID_PLANS),
  /** INR amount in paise for display (e.g. 4900 = ₹49). Backend derives from planId. */
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
});
export type CreateRazorpaySubscriptionDto = z.infer<typeof CreateRazorpaySubscriptionSchema>;

/** Step 2: Verify Razorpay payment signature after checkout completes */
export const VerifyRazorpayPaymentSchema = z.object({
  razorpay_payment_id:    z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature:     z.string().min(1),
});
export type VerifyRazorpayPaymentDto = z.infer<typeof VerifyRazorpayPaymentSchema>;

/** One-time Razorpay order (for non-subscription flows) */
export const CreateRazorpayOrderSchema = z.object({
  planId: z.enum(PAID_PLANS),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
});
export type CreateRazorpayOrderDto = z.infer<typeof CreateRazorpayOrderSchema>;

/** Verify a one-time Razorpay order payment */
export const VerifyRazorpayOrderSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_order_id:   z.string().min(1),
  razorpay_signature:  z.string().min(1),
  planId:              z.enum(PAID_PLANS),
  billingCycle:        z.enum(['monthly', 'annual']).default('monthly'),
});
export type VerifyRazorpayOrderDto = z.infer<typeof VerifyRazorpayOrderSchema>;
