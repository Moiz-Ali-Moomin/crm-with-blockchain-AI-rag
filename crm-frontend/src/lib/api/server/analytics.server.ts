/**
 * Server-side analytics API functions
 *
 * Called exclusively from React Server Components (async functions, no hooks).
 * Uses `cachedServerFetch` so multiple Server Components on the same page
 * requesting the same endpoint share a single fetch per render.
 *
 * Revalidation tags allow targeted cache invalidation:
 *   revalidateTag('analytics') → clears all analytics cache ENTRIES
 */

import { cachedServerFetch } from '@/lib/api/server-client';
import type {
  DashboardMetrics,
  RevenueDataPoint,
  LeadSourceData,
  PipelineFunnelStage,
  SalesRepPerformance,
} from '@/types';

export async function getDashboardMetrics(): Promise<DashboardMetrics | null> {
  return cachedServerFetch<DashboardMetrics>('/analytics/dashboard', {
    revalidate: 30,
    tags: ['analytics', 'analytics:dashboard'],
  });
}

export async function getRevenueData(
  period?: string,
  year?: number,
): Promise<RevenueDataPoint[] | null> {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (year)   params.set('year', String(year));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return cachedServerFetch<RevenueDataPoint[]>(`/analytics/revenue${qs}`, {
    revalidate: 30,
    tags: ['analytics', 'analytics:revenue'],
  });
}

export async function getLeadSources(): Promise<LeadSourceData[] | null> {
  return cachedServerFetch<LeadSourceData[]>('/analytics/lead-sources', {
    revalidate: 60,
    tags: ['analytics', 'analytics:lead-sources'],
  });
}

export async function getSalesPerformance(
  period?: string,
): Promise<SalesRepPerformance[] | null> {
  const qs = period ? `?period=${period}` : '';
  return cachedServerFetch<SalesRepPerformance[]>(`/analytics/sales-performance${qs}`, {
    revalidate: 60,
    tags: ['analytics', 'analytics:sales-performance'],
  });
}

export async function getPipelineFunnel(
  pipelineId?: string,
): Promise<PipelineFunnelStage[] | null> {
  const qs = pipelineId ? `?pipelineId=${pipelineId}` : '';
  return cachedServerFetch<PipelineFunnelStage[]>(`/analytics/pipeline-funnel${qs}`, {
    revalidate: 30,
    tags: ['analytics', 'analytics:pipeline-funnel'],
  });
}
