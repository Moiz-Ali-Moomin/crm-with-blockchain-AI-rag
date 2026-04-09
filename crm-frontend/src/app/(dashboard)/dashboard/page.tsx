import { Suspense } from 'react';
import Link from "next/link";
import { getDashboardMetrics } from '@/lib/api/server/analytics.server';
import { StatCard } from '@/components/ui/stat-card';
import { DashboardCharts } from './_components/dashboard-charts';
import { FloatingAiCopilot } from './_components/ai-copilot-widget';
import {
  Users, TrendingUp, DollarSign, Percent,
  Clock, CheckSquare, ArrowUpRight,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Dashboard' };
export const revalidate = 30;

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_TASKS = [
  { id: '1', title: 'Follow up with Acme Corp',       priority: 'high',   due: 'Today, 2:00 PM', initials: 'JD' },
  { id: '2', title: 'Review proposal for TechStart',  priority: 'medium', due: 'Today, 4:30 PM', initials: 'SA' },
  { id: '3', title: 'Schedule demo with GlobalTech',  priority: 'low',    due: 'Today, 5:00 PM', initials: 'MK' },
  { id: '4', title: 'Update pipeline for Q2 deals',   priority: 'medium', due: 'Today, EOD',     initials: 'JD' },
] as const;

const MOCK_ACTIVITY = [
  { id: '1', user: 'James D.', initials: 'JD', action: 'closed deal',   entity: 'Acme Corp — $12,400',      time: '8m ago',  color: 'bg-emerald-500' },
  { id: '2', user: 'Sara A.',  initials: 'SA', action: 'added contact', entity: 'John Smith @ TechStart',   time: '23m ago', color: 'bg-blue-500' },
  { id: '3', user: 'Mike K.',  initials: 'MK', action: 'moved lead',    entity: 'GlobalTech → Qualified',   time: '1h ago',  color: 'bg-violet-500' },
  { id: '4', user: 'James D.', initials: 'JD', action: 'sent email to', entity: 'Lisa Wang @ Vertex AI',    time: '2h ago',  color: 'bg-blue-500' },
  { id: '5', user: 'Sara A.',  initials: 'SA', action: 'opened ticket', entity: 'Onboarding issue #TK-204', time: '3h ago',  color: 'bg-amber-500' },
] as const;

const priorityStyles: Record<string, string> = {
  high:   'bg-rose-50 text-rose-600 border border-rose-100',
  medium: 'bg-amber-50 text-amber-600 border border-amber-100',
  low:    'bg-gray-100 text-gray-500 border border-gray-200',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-[300px] bg-white border border-gray-200 animate-pulse rounded-xl"
        />
      ))}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href?: string };
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
        {title}
      </h2>
      {action && (
        <Link
          href={action.href || '/'}
          className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
        >
          {action.label}
          <ArrowUpRight size={11} />
        </Link>
      )}
    </div>
  );
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

function TasksList() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2">
          <CheckSquare size={13} className="text-blue-600" />
          <span className="text-[13px] font-semibold">Tasks Due Today</span>
        </div>
        <span className="text-[11px] bg-gray-100 px-2 py-0.5 rounded-full">
          {MOCK_TASKS.length}
        </span>
      </div>

      <div className="divide-y">
        {MOCK_TASKS.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
            <div className="w-4 h-4 rounded border" />
            <div className="flex-1">
              <p className="text-[13px] font-medium">{task.title}</p>
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={10} /> {task.due}
              </div>
            </div>
            <span className={cn("text-[10px] px-2 py-0.5 rounded", priorityStyles[task.priority])}>
              {task.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

function ActivityFeed() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b flex justify-between">
        <span className="text-[13px] font-semibold">Recent Activity</span>
        <Link href="/activities" className="text-xs text-blue-600">View all</Link>
      </div>

      <div className="divide-y">
        {MOCK_ACTIVITY.map((item) => (
          <div key={item.id} className="flex gap-3 px-5 py-3">
            <div className={`w-6 h-6 rounded-full text-white flex items-center justify-center ${item.color}`}>
              {item.initials}
            </div>
            <div>
              <p className="text-xs">
                <b>{item.user}</b> {item.action} {item.entity}
              </p>
              <p className="text-[10px] text-gray-400">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  const kpiCards = [
    {
      title: 'Total Leads',
      value: metrics?.totalLeads ?? 0,
      displayValue: (metrics?.totalLeads ?? 0).toLocaleString(),
      icon: <Users size={14} />,
      gradient: 1 as const,
    },
    {
      title: 'Open Deals',
      value: metrics?.openDeals ?? 0,
      displayValue: (metrics?.openDeals ?? 0).toString(),
      icon: <TrendingUp size={14} />,
      gradient: 2 as const,
    },
    {
      title: 'Revenue (MTD)',
      value: metrics?.revenue ?? 0,
      displayValue: formatCurrency(metrics?.revenue ?? 0),
      icon: <DollarSign size={14} />,
      gradient: 3 as const,
    },
    {
      title: 'Conversion Rate',
      value: metrics?.conversionRate ?? 0,
      displayValue: `${metrics?.conversionRate ?? 0}%`,
      icon: <Percent size={14} />,
      gradient: 4 as const,
    },
  ];

  return (
    <div className="space-y-6">

      {/* ✅ KEY METRICS */}
      <section>
        <SectionHeader title="Key Metrics" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpiCards.map((card, i) => (
            <StatCard key={i} {...card} />
          ))}
        </div>
      </section>

      {/* ✅ PERFORMANCE + TASKS */}
      <section>
        <div className="grid grid-cols-1 xl:grid-cols-10 gap-4">

          <div className="xl:col-span-7">
            <SectionHeader title="Performance" action={{ label: 'Full report', href: '/analytics' }} />
            <Suspense fallback={<ChartsSkeleton />}>
              <DashboardCharts />
            </Suspense>
          </div>

          <div className="xl:col-span-3 space-y-4">
            <SectionHeader title="Today" action={{ label: 'All tasks', href: '/tasks' }} />
            <TasksList />
            <ActivityFeed />
          </div>

        </div>
      </section>

      <FloatingAiCopilot />
    </div>
  );
}