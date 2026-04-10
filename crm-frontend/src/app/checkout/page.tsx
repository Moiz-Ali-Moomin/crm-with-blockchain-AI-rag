'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard, ChevronRight, Shield, Zap, Check,
  ArrowLeft, Copy, ExternalLink, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { billingApi, CryptoPayment } from '@/lib/api/billing.api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

// ── Plan metadata ─────────────────────────────────────────────────────────────

const PLAN_META: Record<string, { name: string; price: number; annualPrice: number; features: string[] }> = {
  starter: {
    name: 'Starter', price: 49, annualPrice: 39,
    features: ['10 users', '5,000 contacts', 'Unlimited deals', 'Email support'],
  },
  pro: {
    name: 'Pro', price: 99, annualPrice: 79,
    features: ['50 users', 'Unlimited contacts', 'Automation workflows', 'API access'],
  },
  pro_plus: {
    name: 'Pro Plus', price: 149, annualPrice: 119,
    features: ['100 users', 'Unlimited contacts', 'Priority phone support', 'Advanced AI features', 'Blockchain audit trail'],
  },
  ultimate: {
    name: 'Ultimate', price: 499, annualPrice: 399,
    features: ['Unlimited users', 'Dedicated account manager', 'Custom AI training', 'White-label option'],
  },
};

// ── Crypto currencies ─────────────────────────────────────────────────────────

const CRYPTO_OPTIONS = [
  { id: 'ETH',  label: 'Ethereum',  subtitle: 'Pay with ETH on mainnet',    color: 'text-indigo-600', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  { id: 'USDC', label: 'USD Coin',  subtitle: 'ERC-20 stablecoin (1:1 USD)', color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200' },
  { id: 'USDT', label: 'Tether',    subtitle: 'ERC-20 stablecoin (1:1 USD)', color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'DAI',  label: 'DAI',       subtitle: 'Decentralised stablecoin',    color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200' },
] as const;

type CryptoCurrency = (typeof CRYPTO_OPTIONS)[number]['id'];

// ── CryptoPaymentModal ────────────────────────────────────────────────────────

function CryptoPaymentModal({
  payment,
  onClose,
}: {
  payment: CryptoPayment;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">
              Crypto Payment
            </p>
            <h3 className="text-base font-bold text-slate-900">
              {payment.planName} &mdash; ${payment.amountUsd} USD
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Amount */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Amount to send</p>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-slate-900">
                {payment.amount} {payment.currency}
              </span>
              <button
                onClick={() => copy(payment.amount)}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Copy size={13} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {payment.ethPriceUsd && (
              <p className="text-xs text-slate-400 mt-1">
                1 ETH = ${payment.ethPriceUsd.toLocaleString()} USD (live rate)
              </p>
            )}
          </div>

          {/* Wallet address */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Send to wallet address</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-slate-800 break-all leading-relaxed">
                {payment.walletAddress}
              </code>
              <button
                onClick={() => copy(payment.walletAddress)}
                className="flex-shrink-0 text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>

          {/* Payment reference */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">
              ⚠ Include this reference in the transaction memo / data field
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono font-bold text-amber-900">
                {payment.paymentRef}
              </code>
              <button
                onClick={() => copy(payment.paymentRef)}
                className="flex-shrink-0 text-amber-700 hover:text-amber-900 transition-colors"
              >
                <Copy size={14} />
              </button>
            </div>
            <p className="text-xs text-amber-600 mt-1.5 leading-relaxed">
              Without this reference we cannot match your payment to your account.
            </p>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
            <Shield size={13} className="flex-shrink-0 mt-0.5 text-slate-400" />
            Your subscription will be activated within 1–3 block confirmations after payment is
            received. Contact support if not activated within 30 minutes.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <a
            href={`https://etherscan.io/address/${payment.walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View on Etherscan
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ── CheckoutContent ───────────────────────────────────────────────────────────

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('plan') ?? '';
  const billingCycle = searchParams.get('billing') === 'annual' ? 'annual' : 'monthly';
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [loading, setLoading] = useState<'stripe' | 'paypal' | CryptoCurrency | null>(null);
  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(`/checkout?plan=${planId}&billing=${billingCycle}`);
      router.replace(`/login?redirect=${returnTo}`);
    }
  }, [isAuthenticated, planId, billingCycle, router]);

  const plan = PLAN_META[planId];

  if (!plan) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Invalid plan selected.</p>
          <Link href="/pricing" className="text-blue-600 hover:text-blue-700 text-sm underline">
            Back to pricing
          </Link>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const billingUrl  = `${origin}/settings/billing`;
  const cancelUrl   = `${origin}/checkout?plan=${planId}&billing=${billingCycle}`;
  const displayPrice = billingCycle === 'annual' ? plan.annualPrice : plan.price;

  async function handleStripe() {
    setLoading('stripe');
    try {
      const { url } = await billingApi.createCheckoutSession({
        planId,
        successUrl: billingUrl,
        returnUrl: cancelUrl,
      });
      window.location.href = url;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start Stripe checkout');
      setLoading(null);
    }
  }

  async function handlePayPal() {
    setLoading('paypal');
    try {
      const { approvalUrl } = await billingApi.createPayPalSubscription({
        planId,
        returnUrl: billingUrl,
        cancelUrl,
      });
      window.location.href = approvalUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start PayPal checkout');
      setLoading(null);
    }
  }

  async function handleCrypto(currency: CryptoCurrency) {
    setLoading(currency);
    try {
      const result = await billingApi.createCryptoPayment({ planId, currency, billingCycle });
      setCryptoPayment(result);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Crypto payments not available right now');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Nav */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Zap size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-slate-900 font-bold text-[17px] tracking-tight">CRM Platform</span>
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to pricing
          </Link>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left: Order summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
              Order Summary
            </p>

            {/* Plan header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-xl font-bold text-slate-900">{plan.name}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {billingCycle === 'annual' ? 'Billed annually · Save 20%' : 'Billed monthly'} · Cancel anytime
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900">${displayPrice}</p>
                <p className="text-xs text-slate-400">/month</p>
              </div>
            </div>

            <div className="border-t border-slate-100 mb-5" />

            {/* Features */}
            <ul className="space-y-2.5 mb-7">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-700">
                  <Check size={14} className="text-blue-500 flex-shrink-0" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>

            {/* Price breakdown */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between text-sm text-slate-500 mb-2">
                <span>{plan.name} ({billingCycle})</span>
                <span>${displayPrice}.00</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500 mb-3">
                <span>Tax</span>
                <span className="text-slate-400">Calculated at checkout</span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between font-bold text-slate-900">
                <span>Due today</span>
                <span>${displayPrice}.00 USD</span>
              </div>
            </div>
          </div>

          {/* Right: Payment methods */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">
              Choose Payment Method
            </p>

            <div className="space-y-3">

              {/* ── Stripe ── */}
              <button
                onClick={handleStripe}
                disabled={loading !== null}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border bg-white shadow-sm transition-all group',
                  'border-slate-200 hover:border-blue-400 hover:shadow-md',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                  <CreditCard size={20} className="text-blue-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-slate-900">Credit / Debit Card</p>
                  <p className="text-xs text-slate-400 mt-0.5">Visa · Mastercard · Amex · Discover</p>
                </div>
                {loading === 'stripe' ? (
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                )}
              </button>

              {/* ── PayPal ── */}
              <button
                onClick={handlePayPal}
                disabled={loading !== null}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-xl border bg-white shadow-sm transition-all group',
                  'border-slate-200 hover:border-blue-400 hover:shadow-md',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50 transition-colors">
                  <span className="text-blue-600 font-extrabold text-lg leading-none">P</span>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-slate-900">PayPal</p>
                  <p className="text-xs text-slate-400 mt-0.5">Pay with your PayPal balance or linked bank</p>
                </div>
                {loading === 'paypal' ? (
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                )}
              </button>

              {/* ── Crypto divider ── */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-xs text-slate-400 font-medium">or pay with crypto</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              {/* ── ETH + Stablecoins ── */}
              {CRYPTO_OPTIONS.map((crypto) => (
                <button
                  key={crypto.id}
                  onClick={() => handleCrypto(crypto.id)}
                  disabled={loading !== null}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-xl border bg-white shadow-sm transition-all group',
                    'border-slate-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed',
                    `hover:border-current hover:${crypto.border}`,
                  )}
                >
                  <div className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
                    crypto.bg, crypto.border, 'border',
                  )}>
                    <span className={cn('text-sm font-extrabold', crypto.color)}>{crypto.id}</span>
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-slate-900">{crypto.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{crypto.subtitle}</p>
                  </div>
                  {loading === crypto.id ? (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {/* Security */}
            <div className="flex items-center gap-2 mt-5">
              <Shield size={13} className="text-slate-400" />
              <p className="text-xs text-slate-400">256-bit encryption · PCI DSS compliant · Cancel anytime</p>
            </div>
          </div>
        </div>
      </div>

      {/* Crypto modal */}
      {cryptoPayment && (
        <CryptoPaymentModal
          payment={cryptoPayment}
          onClose={() => setCryptoPayment(null)}
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
