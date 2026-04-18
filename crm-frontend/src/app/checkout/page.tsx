'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import {
  CreditCard, ChevronRight, Shield, Zap, Check,
  ArrowLeft, Copy, ExternalLink, X, Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { billingApi, CryptoPayment } from '@/lib/api/billing.api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

// ── Razorpay window type ──────────────────────────────────────────────────────
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}
interface RazorpayOptions {
  key: string;
  subscription_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  name: string;
  description: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
}
interface RazorpayInstance { open(): void; }

// ── Plan metadata ─────────────────────────────────────────────────────────────

const PLAN_META: Record<string, {
  name: string; price: number; annualPrice: number;
  priceInr: number; annualPriceInr: number; features: string[];
}> = {
  starter: {
    name: 'Starter', price: 49, annualPrice: 39,
    priceInr: 4900, annualPriceInr: 3900,
    features: ['10 users', '5,000 contacts', 'Unlimited deals', 'Email support'],
  },
  pro: {
    name: 'Pro', price: 99, annualPrice: 79,
    priceInr: 9900, annualPriceInr: 7900,
    features: ['50 users', 'Unlimited contacts', 'Automation workflows', 'API access'],
  },
  pro_plus: {
    name: 'Pro Plus', price: 149, annualPrice: 119,
    priceInr: 14900, annualPriceInr: 11900,
    features: ['100 users', 'Unlimited contacts', 'Priority phone support', 'Advanced AI'],
  },
  ultimate: {
    name: 'Ultimate', price: 499, annualPrice: 399,
    priceInr: 49900, annualPriceInr: 39900,
    features: ['Unlimited users', 'Dedicated account manager', 'Custom AI training'],
  },
};

// ── Crypto currencies ─────────────────────────────────────────────────────────

const CRYPTO_OPTIONS = [
  { id: 'ETH',  label: 'Ethereum',  subtitle: 'Pay with ETH on mainnet',     color: 'text-indigo-600', bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  { id: 'USDC', label: 'USD Coin',  subtitle: 'ERC-20 stablecoin (1:1 USD)',  color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200' },
  { id: 'USDT', label: 'Tether',    subtitle: 'ERC-20 stablecoin (1:1 USD)',  color: 'text-emerald-600',bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'DAI',  label: 'DAI',       subtitle: 'Decentralised stablecoin',     color: 'text-amber-600',  bg: 'bg-amber-50',   border: 'border-amber-200' },
] as const;

type CryptoCurrency = (typeof CRYPTO_OPTIONS)[number]['id'];
type LoadingKey = 'razorpay' | 'razorpay_order' | CryptoCurrency | null;

// ── CryptoPaymentModal ────────────────────────────────────────────────────────

function CryptoPaymentModal({ payment, onClose }: { payment: CryptoPayment; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Crypto Payment</p>
            <h3 className="text-base font-bold text-slate-900">{payment.planName} &mdash; ${payment.amountUsd} USD</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Amount to send</p>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-slate-900">{payment.amount} {payment.currency}</span>
              <button onClick={() => copy(payment.amount)} className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                <Copy size={13} />{copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {payment.ethPriceUsd && (
              <p className="text-xs text-slate-400 mt-1">1 ETH = ${payment.ethPriceUsd.toLocaleString()} USD</p>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">Send to wallet address</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-slate-800 break-all">{payment.walletAddress}</code>
              <button onClick={() => copy(payment.walletAddress)} className="flex-shrink-0 text-blue-600 hover:text-blue-700">
                <Copy size={14} />
              </button>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Include this reference in the memo field</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono font-bold text-amber-900">{payment.paymentRef}</code>
              <button onClick={() => copy(payment.paymentRef)} className="flex-shrink-0 text-amber-700 hover:text-amber-900">
                <Copy size={14} />
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
            <Shield size={13} className="flex-shrink-0 mt-0.5 text-slate-400" />
            Subscription activates within 1–3 block confirmations. Contact support if not active within 30 min.
          </div>
        </div>
        <div className="px-6 pb-5 flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          <a href={`https://etherscan.io/address/${payment.walletAddress}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
            View on Etherscan <ExternalLink size={13} />
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

  const [loading, setLoading] = useState<LoadingKey>(null);
  const [cryptoPayment, setCryptoPayment] = useState<CryptoPayment | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(`/checkout?plan=${planId}&billing=${billingCycle}`)}`);
    }
  }, [isAuthenticated, planId, billingCycle, router]);

  const plan = PLAN_META[planId];
  if (!plan) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500 mb-4">Invalid plan selected.</p>
          <Link href="/pricing" className="text-blue-600 text-sm underline">Back to pricing</Link>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const billingUrl = `${origin}/settings/billing`;
  const cancelUrl  = `${origin}/checkout?plan=${planId}&billing=${billingCycle}`;
  const displayPrice    = billingCycle === 'annual' ? plan.annualPrice    : plan.price;
  const displayPriceInr = billingCycle === 'annual' ? plan.annualPriceInr : plan.priceInr;

  // ── Razorpay subscription (recurring — UPI AutoPay / card mandate) ──────────

  async function handleRazorpay() {
    if (!razorpayLoaded) {
      toast.error('Razorpay is still loading — try again in a moment');
      return;
    }
    setLoading('razorpay');
    try {
      const { subscriptionId, keyId } = await billingApi.createRazorpaySubscription({
        planId, billingCycle,
      });

      const rzp = new window.Razorpay({
        key:             keyId,
        subscription_id: subscriptionId,
        name:            'CRM Platform',
        description:     `${plan.name} — ${billingCycle} subscription`,
        theme:           { color: '#2563EB' },
        handler: async (response) => {
          try {
            await billingApi.verifyRazorpayPayment({
              razorpay_payment_id:      response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id!,
              razorpay_signature:       response.razorpay_signature,
            });
            toast.success('Payment successful! Subscription activated.');
            router.push(billingUrl);
          } catch {
            toast.error('Payment verification failed. Contact support.');
          }
        },
        modal: {
          ondismiss: () => setLoading(null),
        },
      });

      rzp.open();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start Razorpay checkout');
      setLoading(null);
    }
  }

  // ── Razorpay one-time order (fallback) ────────────────────────────────────

  async function handleRazorpayOrder() {
    if (!razorpayLoaded) {
      toast.error('Razorpay is still loading — try again in a moment');
      return;
    }
    setLoading('razorpay_order');
    try {
      const { orderId, amount, currency, keyId } = await billingApi.createRazorpayOrder({
        planId, billingCycle,
      });

      const rzp = new window.Razorpay({
        key:      keyId,
        order_id: orderId,
        amount,
        currency,
        name:        'CRM Platform',
        description: `${plan.name} — ${billingCycle}`,
        theme:       { color: '#2563EB' },
        handler: async (response) => {
          try {
            await billingApi.verifyRazorpayOrder({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id:   response.razorpay_order_id!,
              razorpay_signature:  response.razorpay_signature,
              planId,
              billingCycle,
            });
            toast.success('Payment successful! Plan activated.');
            router.push(billingUrl);
          } catch {
            toast.error('Payment verification failed. Contact support.');
          }
        },
        modal: { ondismiss: () => setLoading(null) },
      });

      rzp.open();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create order');
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
    <>
      {/* Razorpay Checkout script */}
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayLoaded(true)}
      />

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
            <Link href="/pricing" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
              <ArrowLeft size={14} /> Back to pricing
            </Link>
          </div>
        </header>

        {/* Main */}
        <div className="flex-1 flex items-start justify-center p-6 pt-10">
          <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* Left: Order summary */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Order Summary</p>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-xl font-bold text-slate-900">{plan.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {billingCycle === 'annual' ? 'Billed annually · Save 20%' : 'Billed monthly'} · Cancel anytime
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">₹{displayPriceInr.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-slate-400">/month · ~${displayPrice} USD</p>
                </div>
              </div>
              <div className="border-t border-slate-100 mb-5" />
              <ul className="space-y-2.5 mb-7">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <Check size={14} className="text-blue-500 flex-shrink-0" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex justify-between text-sm text-slate-500 mb-2">
                  <span>{plan.name} ({billingCycle})</span>
                  <span>₹{displayPriceInr.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-500 mb-3">
                  <span>Tax (GST)</span>
                  <span className="text-slate-400">Calculated at checkout</span>
                </div>
                <div className="border-t border-slate-200 pt-3 flex justify-between font-bold text-slate-900">
                  <span>Due today</span>
                  <span>₹{displayPriceInr.toLocaleString('en-IN')} INR</span>
                </div>
              </div>
            </div>

            {/* Right: Payment methods */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Choose Payment Method</p>
              <div className="space-y-3">

                {/* ── Razorpay Subscription (UPI AutoPay + card mandate) ── */}
                <button
                  onClick={handleRazorpay}
                  disabled={loading !== null}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-xl border bg-white shadow-sm transition-all group',
                    'border-slate-200 hover:border-blue-400 hover:shadow-md',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                    <Smartphone size={20} className="text-blue-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-slate-900">UPI AutoPay / Card Mandate</p>
                    <p className="text-xs text-slate-400 mt-0.5">Recurring via Razorpay · UPI, Visa, Mastercard, Rupay</p>
                  </div>
                  {loading === 'razorpay' ? (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 flex-shrink-0" />
                  )}
                </button>

                {/* ── Razorpay One-time Order ── */}
                <button
                  onClick={handleRazorpayOrder}
                  disabled={loading !== null}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-xl border bg-white shadow-sm transition-all group',
                    'border-slate-200 hover:border-blue-400 hover:shadow-md',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-50">
                    <CreditCard size={20} className="text-blue-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-slate-900">Pay Once (Card / UPI / Netbanking)</p>
                    <p className="text-xs text-slate-400 mt-0.5">One-time payment via Razorpay · no mandate</p>
                  </div>
                  {loading === 'razorpay_order' ? (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 flex-shrink-0" />
                  )}
                </button>

                {/* ── Crypto divider ── */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 border-t border-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">or pay with crypto</span>
                  <div className="flex-1 border-t border-slate-200" />
                </div>

                {/* ── Crypto options ── */}
                {CRYPTO_OPTIONS.map((crypto) => (
                  <button
                    key={crypto.id}
                    onClick={() => handleCrypto(crypto.id)}
                    disabled={loading !== null}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-xl border bg-white shadow-sm transition-all group',
                      'border-slate-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border', crypto.bg, crypto.border)}>
                      <span className={cn('text-sm font-extrabold', crypto.color)}>{crypto.id}</span>
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-semibold text-slate-900">{crypto.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{crypto.subtitle}</p>
                    </div>
                    {loading === crypto.id ? (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-5">
                <Shield size={13} className="text-slate-400" />
                <p className="text-xs text-slate-400">256-bit encryption · RBI compliant · Cancel anytime</p>
              </div>
            </div>
          </div>
        </div>

        {cryptoPayment && (
          <CryptoPaymentModal payment={cryptoPayment} onClose={() => setCryptoPayment(null)} />
        )}
      </div>
    </>
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
