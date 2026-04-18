/**
 * RazorpayService
 *
 * Handles the full Razorpay payment rail:
 *   - Subscription creation (recurring — UPI AutoPay, cards, netbanking)
 *   - One-time order creation (fallback / top-up)
 *   - Payment signature verification (HMAC-SHA256)
 *   - Webhook processing (payment.captured, subscription.charged, subscription.cancelled)
 *
 * Env vars required:
 *   RAZORPAY_KEY_ID       — public key (starts with rzp_test_ or rzp_live_)
 *   RAZORPAY_KEY_SECRET   — private secret for HMAC signing
 *   RAZORPAY_WEBHOOK_SECRET — separate secret set in Razorpay dashboard → Webhooks
 *   RAZORPAY_PLAN_STARTER / PRO / PRO_PLUS / ULTIMATE / ENTERPRISE — plan IDs from dashboard
 */

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { BusinessRuleError, ExternalServiceError } from '../../shared/errors/domain.errors';
import { BillingRepository } from './billing.repository';
import {
  CreateRazorpaySubscriptionDto,
  VerifyRazorpayPaymentDto,
  CreateRazorpayOrderDto,
  VerifyRazorpayOrderDto,
} from './billing.dto';
import { PLANS } from './billing.service';

// ── Plan map (read once at startup) ──────────────────────────────────────────
const RAZORPAY_PLAN_ID_MAP: Record<string, string | undefined> = {
  starter:    process.env.RAZORPAY_PLAN_STARTER,
  pro:        process.env.RAZORPAY_PLAN_PRO,
  pro_plus:   process.env.RAZORPAY_PLAN_PRO_PLUS,
  ultimate:   process.env.RAZORPAY_PLAN_ULTIMATE,
  enterprise: process.env.RAZORPAY_PLAN_ENTERPRISE,
};

// INR prices (paise = ₹ × 100). Annual = 20% discount.
const PLAN_INR_MONTHLY: Record<string, number> = {
  starter:    4900_00,   // ₹4,900 / mo
  pro:        9900_00,
  pro_plus:   14900_00,
  ultimate:   49900_00,
  enterprise: 0,
};

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);

  private readonly rz: Razorpay;

  constructor(private readonly billingRepo: BillingRepository) {
    const keyId     = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set');
    }
    this.rz = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS (recurring — recommended for SaaS plans)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Step 1 — Create a Razorpay Subscription and return the subscription_id.
   * The frontend passes this to the Razorpay Checkout SDK to open the payment modal.
   *
   * Supports: UPI AutoPay, cards with mandate, netbanking recurring.
   */
  async createSubscription(tenantId: string, dto: CreateRazorpaySubscriptionDto) {
    const razorpayPlanId = RAZORPAY_PLAN_ID_MAP[dto.planId];
    if (!razorpayPlanId) {
      throw new BusinessRuleError(`No Razorpay plan configured for: ${dto.planId}`);
    }

    // Ensure/create a Razorpay customer for this tenant
    const billing = await this.billingRepo.findByTenantId(tenantId)
      ?? await this.billingRepo.create(tenantId);

    let customerId = (billing as any).razorpayCustomerId as string | null;
    if (!customerId) {
      const customer = await this.rz.customers.create({
        name:     `Tenant ${tenantId.slice(0, 8)}`,
        notes:    { tenantId },
      });
      customerId = customer.id;
      await this.billingRepo.update(tenantId, { razorpayCustomerId: customerId } as any);
    }

    const totalCount = dto.billingCycle === 'annual' ? 12 : 120; // 12 months or 10 years

    const subscription = await (this.rz.subscriptions as any).create({
      plan_id:     razorpayPlanId,
      customer_id: customerId,
      total_count: totalCount,
      quantity:    1,
      notes:       { tenantId, planId: dto.planId, billingCycle: dto.billingCycle },
    });

    this.logger.log(
      `Razorpay subscription ${subscription.id} created for tenant ${tenantId} (plan: ${dto.planId})`,
    );

    return {
      subscriptionId: subscription.id as string,
      status:         subscription.status as string,
      keyId:          process.env.RAZORPAY_KEY_ID,
    };
  }

  /**
   * Step 2 — Verify payment signature returned by Razorpay Checkout after the user pays.
   * Activates the subscription in our DB.
   *
   * Signature: HMAC_SHA256(razorpay_payment_id + "|" + razorpay_subscription_id, key_secret)
   */
  async verifySubscriptionPayment(tenantId: string, dto: VerifyRazorpayPaymentDto) {
    const secret = process.env.RAZORPAY_KEY_SECRET!;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${dto.razorpay_payment_id}|${dto.razorpay_subscription_id}`)
      .digest('hex');

    if (expected !== dto.razorpay_signature) {
      this.logger.warn(
        `Razorpay signature mismatch for tenant ${tenantId}: ` +
        `payment=${dto.razorpay_payment_id} sub=${dto.razorpay_subscription_id}`,
      );
      throw new BusinessRuleError('Payment signature verification failed');
    }

    // Fetch subscription details from Razorpay to get plan + period
    const sub = await (this.rz.subscriptions as any).fetch(dto.razorpay_subscription_id);
    const plan = this.getPlanFromRazorpayPlanId(sub.plan_id);

    const nextBilling = sub.charge_at
      ? new Date(sub.charge_at * 1000)
      : null;

    await this.billingRepo.upsert(tenantId, {
      razorpaySubscriptionId: dto.razorpay_subscription_id,
      razorpayPaymentId:      dto.razorpay_payment_id,
      plan:                   plan.toUpperCase(),
      status:                 'ACTIVE',
      currentPeriodEnd:       nextBilling,
    } as any);

    this.logger.log(
      `Razorpay subscription verified for tenant ${tenantId}: plan=${plan}, sub=${dto.razorpay_subscription_id}`,
    );

    return { success: true, plan, subscriptionId: dto.razorpay_subscription_id };
  }

  async cancelSubscription(tenantId: string) {
    const billing = await this.billingRepo.findByTenantId(tenantId);
    const subId = (billing as any)?.razorpaySubscriptionId as string | null;
    if (!subId) throw new BusinessRuleError('No active Razorpay subscription found');

    await (this.rz.subscriptions as any).cancel(subId);

    await this.billingRepo.update(tenantId, {
      razorpaySubscriptionId: null,
      plan:              'FREE',
      status:            'CANCELLED',
      cancelAtPeriodEnd: false,
      currentPeriodEnd:  null,
    } as any);

    return { message: 'Razorpay subscription cancelled' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORDERS (one-time payment)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a Razorpay Order for a one-time payment.
   * Used as fallback when subscription mandate fails or for manual top-ups.
   */
  async createOrder(tenantId: string, dto: CreateRazorpayOrderDto) {
    const monthlyPaise = PLAN_INR_MONTHLY[dto.planId];
    if (!monthlyPaise) {
      throw new BusinessRuleError(`No INR price configured for plan: ${dto.planId}`);
    }

    const amountPaise = dto.billingCycle === 'annual'
      ? Math.round(monthlyPaise * 12 * 0.8)
      : monthlyPaise;

    const order = await this.rz.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      notes:    { tenantId, planId: dto.planId, billingCycle: dto.billingCycle },
    });

    await this.billingRepo.update(tenantId, { razorpayOrderId: order.id } as any);

    this.logger.log(`Razorpay order ${order.id} created for tenant ${tenantId}`);

    return {
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
    };
  }

  /**
   * Verify a one-time order payment.
   * Signature: HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret)
   */
  async verifyOrderPayment(tenantId: string, dto: VerifyRazorpayOrderDto) {
    const secret = process.env.RAZORPAY_KEY_SECRET!;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
      .digest('hex');

    if (expected !== dto.razorpay_signature) {
      throw new BusinessRuleError('Order payment signature verification failed');
    }

    const periodMs = dto.billingCycle === 'annual'
      ? 365 * 24 * 60 * 60 * 1000
      :  30 * 24 * 60 * 60 * 1000;

    await this.billingRepo.upsert(tenantId, {
      razorpayPaymentId: dto.razorpay_payment_id,
      razorpayOrderId:   dto.razorpay_order_id,
      plan:              dto.planId.toUpperCase(),
      status:            'ACTIVE',
      currentPeriodEnd:  new Date(Date.now() + periodMs),
    } as any);

    this.logger.log(
      `Razorpay order payment verified for tenant ${tenantId}: order=${dto.razorpay_order_id}`,
    );

    return { success: true, plan: dto.planId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBHOOKS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Verify webhook signature and dispatch to event handlers.
   *
   * Razorpay signs webhooks with:
   *   HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
   * Header: X-Razorpay-Signature
   */
  async handleWebhook(rawBody: string, signature: string) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new ExternalServiceError('Razorpay - RAZORPAY_WEBHOOK_SECRET not configured');
    }

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expected !== signature) {
      this.logger.warn('Razorpay webhook signature mismatch');
      throw new BusinessRuleError('Razorpay webhook signature verification failed');
    }

    const event = JSON.parse(rawBody);
    this.logger.log(`Processing Razorpay webhook: ${event.event}`);

    switch (event.event) {
      case 'payment.captured':
        await this.onPaymentCaptured(event.payload.payment.entity);
        break;

      case 'subscription.charged':
        await this.onSubscriptionCharged(event.payload.subscription.entity);
        break;

      case 'subscription.cancelled':
      case 'subscription.completed':
        await this.onSubscriptionCancelled(event.payload.subscription.entity);
        break;

      case 'subscription.activated':
        await this.onSubscriptionActivated(event.payload.subscription.entity);
        break;

      default:
        this.logger.debug(`Unhandled Razorpay event: ${event.event}`);
    }

    return { received: true };
  }

  // ── Webhook handlers ────────────────────────────────────────────────────────

  private async onPaymentCaptured(payment: any) {
    const tenantId = payment.notes?.tenantId;
    if (!tenantId) return;

    await this.billingRepo.update(tenantId, {
      razorpayPaymentId: payment.id,
      status: 'ACTIVE',
    } as any);

    this.logger.log(`payment.captured for tenant ${tenantId}: ${payment.id}`);
  }

  private async onSubscriptionCharged(subscription: any) {
    const tenantId = subscription.notes?.tenantId;
    if (!tenantId) return;

    const nextBilling = subscription.charge_at
      ? new Date(subscription.charge_at * 1000)
      : undefined;

    await this.billingRepo.update(tenantId, {
      status:          'ACTIVE',
      currentPeriodEnd: nextBilling,
    } as any);

    this.logger.log(`subscription.charged for tenant ${tenantId}`);
  }

  private async onSubscriptionCancelled(subscription: any) {
    const tenantId = subscription.notes?.tenantId;
    if (!tenantId) return;

    await this.billingRepo.update(tenantId, {
      razorpaySubscriptionId: null,
      plan:              'FREE',
      status:            'CANCELLED',
      cancelAtPeriodEnd: false,
      currentPeriodEnd:  null,
    } as any);

    this.logger.log(`subscription.cancelled for tenant ${tenantId}`);
  }

  private async onSubscriptionActivated(subscription: any) {
    const tenantId = subscription.notes?.tenantId;
    if (!tenantId) return;

    const plan = this.getPlanFromRazorpayPlanId(subscription.plan_id);

    await this.billingRepo.upsert(tenantId, {
      razorpaySubscriptionId: subscription.id,
      plan:   plan.toUpperCase(),
      status: 'ACTIVE',
      currentPeriodEnd: subscription.charge_at
        ? new Date(subscription.charge_at * 1000)
        : null,
    } as any);

    this.logger.log(`subscription.activated for tenant ${tenantId}: plan=${plan}`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private getPlanFromRazorpayPlanId(razorpayPlanId: string): string {
    const entry = Object.entries(RAZORPAY_PLAN_ID_MAP).find(([, id]) => id === razorpayPlanId);
    return entry ? entry[0] : 'pro';
  }

  getPlanDetails() {
    return PLANS.filter((p) => p.price > 0).map((p) => ({
      ...p,
      priceInr: PLAN_INR_MONTHLY[p.id] ?? 0,
      razorpayPlanId: RAZORPAY_PLAN_ID_MAP[p.id] ?? null,
    }));
  }
}
