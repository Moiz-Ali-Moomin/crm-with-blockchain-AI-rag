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

export const CreateCryptoPaymentSchema = z.object({
  planId: z.enum(PAID_PLANS),
  currency: z.enum(['ETH', 'USDC', 'USDT', 'DAI']),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
});
export type CreateCryptoPaymentDto = z.infer<typeof CreateCryptoPaymentSchema>;
