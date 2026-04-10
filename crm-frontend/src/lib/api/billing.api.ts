import { apiGet, apiPost } from './client';

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string | null;
  features: string[];
}

export interface BillingInfo {
  id: string;
  tenantId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paypalSubscriptionId: string | null;
  plan: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  description: string | null;
}

export interface CheckoutSession {
  url: string;
}

export interface PayPalSubscription {
  subscriptionId: string;
  approvalUrl: string;
}

export const billingApi = {
  getInfo: () => apiGet<BillingInfo>('/billing'),

  getPlans: () => apiGet<Plan[]>('/billing/plans'),

  getInvoices: () => apiGet<Invoice[]>('/billing/invoices'),

  createCheckoutSession: (data: {
    plan: string;
    successUrl: string;
    cancelUrl: string;
  }) => apiPost<CheckoutSession>('/billing/checkout', data),

  cancelSubscription: () => apiPost<{ message: string }>('/billing/cancel'),

  createPayPalSubscription: (data: {
    plan: string;
    returnUrl: string;
    cancelUrl: string;
  }) => apiPost<PayPalSubscription>('/billing/paypal/subscribe', data),

  cancelPayPalSubscription: () =>
    apiPost<{ message: string }>('/billing/paypal/cancel'),
};
