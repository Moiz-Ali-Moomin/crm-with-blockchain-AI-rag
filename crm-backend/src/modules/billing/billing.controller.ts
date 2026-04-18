/**
 * BillingController
 *
 * Thin controller for billing and subscription management.
 * Webhook routes are @Public() and use rawBody from the request.
 */

import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Headers,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { RazorpayService } from './razorpay.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UserRole } from '@prisma/client';
import {
  CreateCheckoutSessionSchema,
  CreateCheckoutSessionDto,
  CreatePayPalSubscriptionSchema,
  CreatePayPalSubscriptionDto,
  ActivatePayPalSubscriptionSchema,
  ActivatePayPalSubscriptionDto,
  UpdatePayPalPlanSchema,
  UpdatePayPalPlanDto,
  CreateCryptoPaymentSchema,
  CreateCryptoPaymentDto,
  ConfirmCryptoPaymentSchema,
  ConfirmCryptoPaymentDto,
  RefundStripeChargeSchema,
  RefundStripeChargeDto,
  CreateRazorpaySubscriptionSchema,
  CreateRazorpaySubscriptionDto,
  VerifyRazorpayPaymentSchema,
  VerifyRazorpayPaymentDto,
  CreateRazorpayOrderSchema,
  CreateRazorpayOrderDto,
  VerifyRazorpayOrderSchema,
  VerifyRazorpayOrderDto,
} from './billing.dto';

@ApiTags('billing')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly service: BillingService,
    private readonly razorpayService: RazorpayService,
  ) {}

  // ── Info & Plans ───────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get current billing info for the authenticated tenant' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getBillingInfo(@CurrentUser() user: JwtUser) {
    return this.service.getBillingInfo(user.tenantId);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all available subscription plans' })
  getPlans() {
    return this.service.getPlans();
  }

  // ── Stripe ─────────────────────────────────────────────────────────────────

  @Post('checkout')
  @ApiOperation({ summary: 'Create a Stripe Checkout session for a subscription' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createCheckoutSession(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateCheckoutSessionSchema)) dto: CreateCheckoutSessionDto,
  ) {
    return this.service.createCheckoutSession(user.tenantId, dto);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel the current Stripe subscription at period end' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  cancelSubscription(@CurrentUser() user: JwtUser) {
    return this.service.cancelSubscription(user.tenantId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List Stripe invoices for the current tenant' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getInvoices(@CurrentUser() user: JwtUser) {
    return this.service.getInvoices(user.tenantId);
  }

  /**
   * Refund the most recent paid Stripe invoice.
   * Supports full or partial (amountCents) refunds.
   * Full refund downgrades the tenant to FREE.
   */
  @Post('refund')
  @ApiOperation({ summary: 'Refund the latest Stripe invoice (full or partial)' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  refundLatestInvoice(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(RefundStripeChargeSchema)) dto: RefundStripeChargeDto,
  ) {
    return this.service.refundLatestStripeInvoice(user.tenantId, dto);
  }

  @Post('webhook')
  @Public()
  @ApiExcludeEndpoint()
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.service.handleWebhook(req.rawBody, signature);
  }

  // ── PayPal ─────────────────────────────────────────────────────────────────

  /**
   * Step 1: Create a PayPal subscription and get the approval URL.
   * Redirect the user to approvalUrl; they will return to returnUrl with ?subscription_id=...
   */
  @Post('paypal/subscribe')
  @ApiOperation({ summary: 'Create a PayPal subscription and get the approval URL' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createPayPalSubscription(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreatePayPalSubscriptionSchema)) dto: CreatePayPalSubscriptionDto,
  ) {
    return this.service.createPayPalSubscription(user.tenantId, dto);
  }

  /**
   * Step 2: After the user approves on PayPal's site, the frontend extracts
   * subscription_id from the redirect URL and calls this endpoint to activate.
   */
  @Post('paypal/activate')
  @ApiOperation({ summary: 'Activate a PayPal subscription after user approval' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  activatePayPalSubscription(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(ActivatePayPalSubscriptionSchema)) dto: ActivatePayPalSubscriptionDto,
  ) {
    return this.service.activatePayPalSubscription(user.tenantId, dto);
  }

  /**
   * Upgrade or downgrade an existing PayPal subscription.
   * Returns an approvalUrl if PayPal requires the user to re-confirm.
   */
  @Patch('paypal/upgrade')
  @ApiOperation({ summary: 'Change the plan of an active PayPal subscription' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  upgradePayPalPlan(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdatePayPalPlanSchema)) dto: UpdatePayPalPlanDto,
  ) {
    return this.service.upgradePayPalPlan(user.tenantId, dto);
  }

  @Post('paypal/cancel')
  @ApiOperation({ summary: 'Cancel the current PayPal subscription immediately' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  cancelPayPalSubscription(@CurrentUser() user: JwtUser) {
    return this.service.cancelPayPalSubscription(user.tenantId);
  }

  @Post('paypal/webhook')
  @Public()
  @ApiExcludeEndpoint()
  async handlePayPalWebhook(
    @Headers() headers: Record<string, string>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString('utf-8') ?? '';
    return this.service.handlePayPalWebhook(headers, rawBody);
  }

  // ── Crypto ─────────────────────────────────────────────────────────────────

  /**
   * Generate a crypto payment intent with wallet address and amount.
   * Stores the intent in BillingInfo.metadata for tracking.
   * The intent expires after 24 hours.
   */
  @Post('crypto/create')
  @ApiOperation({ summary: 'Generate a crypto payment intent (USDC / ETH / DAI / USDT)' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createCryptoPayment(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateCryptoPaymentSchema)) dto: CreateCryptoPaymentDto,
  ) {
    return this.service.createCryptoPayment(user.tenantId, dto);
  }

  /**
   * Check whether this tenant has a pending crypto payment and its current status.
   * Frontend can poll this after the user has sent the crypto.
   */
  @Get('crypto/status')
  @ApiOperation({ summary: 'Check the status of a pending crypto payment' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getCryptoPaymentStatus(@CurrentUser() user: JwtUser) {
    return this.service.getCryptoPaymentStatus(user.tenantId);
  }

  /**
   * SUPER_ADMIN only — confirm a crypto payment after manually verifying
   * the transaction on-chain. Activates the tenant's subscription.
   */
  @Post('crypto/confirm')
  @ApiOperation({ summary: '[Admin] Manually confirm a crypto payment by tx hash' })
  @Roles(UserRole.SUPER_ADMIN)
  adminConfirmCryptoPayment(
    @Body(new ZodValidationPipe(ConfirmCryptoPaymentSchema)) dto: ConfirmCryptoPaymentDto,
  ) {
    return this.service.adminConfirmCryptoPayment(dto);
  }

  // ── Razorpay ───────────────────────────────────────────────────────────────

  /**
   * Step 1: Create a Razorpay Subscription.
   * Returns { subscriptionId, keyId } — frontend passes these to Razorpay Checkout SDK.
   * Supports UPI AutoPay, cards, netbanking recurring mandates.
   */
  @Post('razorpay/subscribe')
  @ApiOperation({ summary: 'Create a Razorpay subscription (UPI AutoPay / card recurring)' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createRazorpaySubscription(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateRazorpaySubscriptionSchema)) dto: CreateRazorpaySubscriptionDto,
  ) {
    return this.razorpayService.createSubscription(user.tenantId, dto);
  }

  /**
   * Step 2: Verify Razorpay subscription payment after checkout completes.
   * Frontend calls this with the three values returned by Razorpay Checkout SDK.
   */
  @Post('razorpay/verify')
  @ApiOperation({ summary: 'Verify Razorpay subscription payment signature' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  verifyRazorpayPayment(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(VerifyRazorpayPaymentSchema)) dto: VerifyRazorpayPaymentDto,
  ) {
    return this.razorpayService.verifySubscriptionPayment(user.tenantId, dto);
  }

  /**
   * Create a Razorpay Order for a one-time payment (fallback / top-up).
   * Returns { orderId, amount, currency, keyId }.
   */
  @Post('razorpay/order')
  @ApiOperation({ summary: 'Create a Razorpay one-time order' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createRazorpayOrder(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateRazorpayOrderSchema)) dto: CreateRazorpayOrderDto,
  ) {
    return this.razorpayService.createOrder(user.tenantId, dto);
  }

  /** Verify a one-time Razorpay order payment signature */
  @Post('razorpay/verify-order')
  @ApiOperation({ summary: 'Verify Razorpay one-time order payment signature' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  verifyRazorpayOrder(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(VerifyRazorpayOrderSchema)) dto: VerifyRazorpayOrderDto,
  ) {
    return this.razorpayService.verifyOrderPayment(user.tenantId, dto);
  }

  @Delete('razorpay/cancel')
  @ApiOperation({ summary: 'Cancel the active Razorpay subscription' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  cancelRazorpaySubscription(@CurrentUser() user: JwtUser) {
    return this.razorpayService.cancelSubscription(user.tenantId);
  }

  @Post('razorpay/webhook')
  @Public()
  @ApiExcludeEndpoint()
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString('utf-8') ?? '';
    return this.razorpayService.handleWebhook(rawBody, signature);
  }
}
