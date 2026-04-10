'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Zap, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { billingApi } from '@/lib/api/billing.api';
import { queryKeys } from '@/lib/query/query-keys';

export function UpgradeBanner() {
  const [dismissed, setDismissed] = useState(false);

  const { data: billing, isLoading } = useQuery({
    queryKey: queryKeys.billing.info,
    queryFn: billingApi.getInfo,
    retry: false,
    // treat a 404/error as "free" — new tenants may not have a billing record yet
  });

  // Only show for free plan, and only until dismissed
  const isFree = !billing || billing.plan === 'free' || billing.plan === 'FREE';
  if (isLoading || !isFree || dismissed) return null;

  return (
    <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl px-5 py-4 shadow-sm">

      {/* Left: icon + copy */}
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
          <Zap size={15} className="text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-snug">
            You&apos;re on the Free plan
          </p>
          <p className="text-xs text-blue-100 mt-0.5">
            Unlock unlimited contacts, AI features, automation workflows, and more.
          </p>
        </div>
      </div>

      {/* Right: CTA */}
      <div className="flex items-center gap-3 flex-shrink-0 ml-11 sm:ml-0">
        <Link
          href="/pricing"
          className="flex items-center gap-1.5 text-sm font-semibold bg-white text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
        >
          Upgrade now
          <ArrowRight size={14} strokeWidth={2.5} />
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/70 hover:text-white transition-colors p-1"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
