/**
 * Dashboard — React Server Component
 *
 * Data flow:
 * 1. Server fetches analytics via `getDashboardMetrics()` on the Node.js edge
 *    (cookies are forwarded for auth — see lib/api/server-client.ts)
 * 2. StatCards are rendered server-side with real data (or zero-state if auth
 *    cookie is not yet set up — Client Component islands will hydrate the data)
 * 3. Charts and AI Copilot are Client Component islands wrapped in <Suspense>
 *
 * Cache: analytics data revalidates every 30 seconds via Next.js ISR.
 * Tag: 'analytics:dashboard' — can be invalidated on-demand via revalidateTag().
 */

import { Suspense } from 'react';
import { getDashboardMetrics } from '@/lib/api/server/analytics.server';
import { StatCard } from '@/components/ui/stat-card';
import { DashboardCharts } from './_components/dashboard-charts';
import { AiCopilotWidget } from './_components/ai-copilot-widget';
import { GlassDivider } from '@/components/ui/glass-card';
import {
  Users, UserCircle, TrendingUp, DollarSign,
  Percent, BarChart2, Ticket, CheckCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
};

// Revalidate this page every 30 seconds (ISR)
export const revalidate = 30;

// ── Suspense fallback for charts ─────────────────────────────────────────────

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-[300px] glass-skeleton rounded-2xl"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">
      {children}
    </p>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // Server-side fetch — runs on the Node.js edge, cookies forwarded
  const metrics = await getDashboardMetrics();

  const stats = metrics
    ? [
        {
          title:        'Total Leads',
          value:        metrics.totalLeads,
          displayValue: metrics.totalLeads.toLocaleString(),
          icon:         <Users size={16} strokeWidth={2} />,
          gradient:     1 as const,
          trend: {
            direction: 'up' as const,
            value:     `+${metrics.newLeadsThisMonth}`,
            label:     'this month',
          },
        },
        {
          title:        'Total Contacts',
          value:        metrics.totalContacts,
          displayValue: metrics.totalContacts.toLocaleString(),
          icon:         <UserCircle size={16} strokeWidth={2} />,
          gradient:     2 as const,
          sub:          'Active relationships',
        },
        {
          title:        'Open Deals',
          value:        metrics.openDeals,
          displayValue: metrics.openDeals.toLocaleString(),
          icon:         <TrendingUp size={16} strokeWidth={2} />,
          gradient:     3 as const,
          sub:          `${formatCurrency(metrics.totalDealValue)} pipeline`,
        },
        {
          title:        'Revenue (MTD)',
          value:        formatCurrency(metrics.revenueThisMonth),
          displayValue: formatCurrency(metrics.revenueThisMonth),
          icon:         <DollarSign size={16} strokeWidth={2} />,
          gradient:     2 as const,
          trend: {
            direction: (metrics.revenueGrowth >= 0 ? 'up' : 'down') as 'up' | 'down',
            value:     `${metrics.revenueGrowth >= 0 ? '+' : ''}${metrics.revenueGrowth.toFixed(1)}%`,
            label:     'vs last month',
          },
        },
        {
          title:        'Conversion Rate',
          value:        `${metrics.conversionRate.toFixed(1)}%`,
          displayValue: `${metrics.conversionRate.toFixed(1)}%`,
          icon:         <Percent size={16} strokeWidth={2} />,
          gradient:     1 as const,
          sub:          'Lead → Deal',
        },
        {
          title:        'Avg Deal Size',
          value:        formatCurrency(metrics.avgDealSize),
          displayValue: formatCurrency(metrics.avgDealSize),
          icon:         <BarChart2 size={16} strokeWidth={2} />,
          gradient:     3 as const,
        },
        {
          title:        'Open Tickets',
          value:        metrics.openTickets,
          displayValue: metrics.openTickets.toLocaleString(),
          icon:         <Ticket size={16} strokeWidth={2} />,
          gradient:     4 as const,
          trend: {
            direction: 'flat' as const,
            value:     `${metrics.openTickets} open`,
          },
        },
        {
          title:        'Deals Won (MTD)',
          value:        metrics.wonDealsThisMonth,
          displayValue: metrics.wonDealsThisMonth.toLocaleString(),
          icon:         <CheckCircle size={16} strokeWidth={2} />,
          gradient:     2 as const,
          sub:          `${formatCurrency(metrics.wonDealValue)} won value`,
        },
      ]
    : // Zero-state when server fetch fails (client islands will hydrate)
      [
        { title: 'Total Leads',     icon: <Users size={16} strokeWidth={2} />,       gradient: 1 as const, value: '—', displayValue: '—' },
        { title: 'Total Contacts',  icon: <UserCircle size={16} strokeWidth={2} />,  gradient: 2 as const, value: '—', displayValue: '—' },
        { title: 'Open Deals',      icon: <TrendingUp size={16} strokeWidth={2} />,  gradient: 3 as const, value: '—', displayValue: '—' },
        { title: 'Revenue (MTD)',   icon: <DollarSign size={16} strokeWidth={2} />,  gradient: 2 as const, value: '—', displayValue: '—' },
        { title: 'Conversion Rate', icon: <Percent size={16} strokeWidth={2} />,     gradient: 1 as const, value: '—', displayValue: '—' },
        { title: 'Avg Deal Size',   icon: <BarChart2 size={16} strokeWidth={2} />,   gradient: 3 as const, value: '—', displayValue: '—' },
        { title: 'Open Tickets',    icon: <Ticket size={16} strokeWidth={2} />,      gradient: 4 as const, value: '—', displayValue: '—' },
        { title: 'Deals Won (MTD)', icon: <CheckCircle size={16} strokeWidth={2} />, gradient: 2 as const, value: '—', displayValue: '—' },
      ];

  return (
    <div className="space-y-8">
      {/* ── KPI stat grid ──────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Key metrics</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
          {stats.map((stat, i) => (
            <StatCard
              key={stat.title}
              index={i}
              title={stat.title}
              value={stat.value}
              displayValue={stat.displayValue}
              icon={stat.icon}
              gradient={stat.gradient}
              trend={'trend' in stat ? stat.trend : undefined}
              sub={'sub' in stat ? stat.sub : undefined}
            />
          ))}
        </div>
      </section>

      <GlassDivider />

      {/* ── Charts + AI Copilot ────────────────────────────────────────────── */}
      <section>
        <SectionLabel>Analytics & Intelligence</SectionLabel>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-3">
          {/* Charts take 2/3 width on xl */}
          <div className="xl:col-span-2">
            <Suspense fallback={<ChartsSkeleton />}>
              <DashboardCharts />
            </Suspense>
          </div>

          {/* AI Copilot takes 1/3 width on xl, full height */}
          <div className="min-h-[480px]">
            <AiCopilotWidget />
          </div>
        </div>
      </section>
    </div>
  );
}
