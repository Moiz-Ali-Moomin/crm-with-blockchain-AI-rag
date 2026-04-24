import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { BusinessMetricsService } from '../../core/metrics/business-metrics.service';

export type ToolCallStatus =
  | 'success'
  | 'error'
  | 'permission_denied'
  | 'validation_error'
  | 'not_found';

@Injectable()
export class McpMetricsService implements OnModuleInit {
  private readonly logger = new Logger(McpMetricsService.name);

  // ─── Counters ──────────────────────────────────────────────────────────────

  private toolCallsTotal!: Counter<string>;
  private agentRunsTotal!: Counter<string>;

  // ─── Histograms ────────────────────────────────────────────────────────────

  private toolLatencyMs!: Histogram<string>;
  private agentLatencyMs!: Histogram<string>;
  private agentIterations!: Histogram<string>;

  constructor(private readonly businessMetrics: BusinessMetricsService) {}

  onModuleInit(): void {
    const reg = this.businessMetrics.registry;

    this.toolCallsTotal = new Counter({
      name: 'crm_mcp_tool_calls_total',
      help: 'MCP tool invocations by tool name, tenant, and outcome',
      labelNames: ['tool_name', 'tenant_id', 'status'],
      registers: [reg],
    });

    this.toolLatencyMs = new Histogram({
      name: 'crm_mcp_tool_latency_ms',
      help: 'MCP tool execution latency in milliseconds (successful calls only)',
      labelNames: ['tool_name', 'tenant_id'],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000],
      registers: [reg],
    });

    this.agentRunsTotal = new Counter({
      name: 'crm_mcp_agent_runs_total',
      help: 'Total agent agentic-loop runs by tenant and whether max iterations was hit',
      labelNames: ['tenant_id', 'stopped_early'],
      registers: [reg],
    });

    this.agentLatencyMs = new Histogram({
      name: 'crm_mcp_agent_latency_ms',
      help: 'End-to-end agent run latency in milliseconds',
      labelNames: ['tenant_id'],
      buckets: [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000],
      registers: [reg],
    });

    this.agentIterations = new Histogram({
      name: 'crm_mcp_agent_iterations',
      help: 'Number of LLM iterations per agent run',
      labelNames: ['tenant_id'],
      buckets: [1, 2, 3, 4, 5],
      registers: [reg],
    });

    this.logger.log('MCP Prometheus metrics registered');
  }

  recordToolCall(params: {
    toolName: string;
    tenantId: string;
    status: ToolCallStatus;
    latencyMs: number;
  }): void {
    const { toolName, tenantId, status, latencyMs } = params;
    this.toolCallsTotal.inc({ tool_name: toolName, tenant_id: tenantId, status });
    // Only record latency for successful calls — errors skew p99 meaningfully
    if (status === 'success') {
      this.toolLatencyMs.observe({ tool_name: toolName, tenant_id: tenantId }, latencyMs);
    }
  }

  recordAgentRun(params: {
    tenantId: string;
    latencyMs: number;
    iterations: number;
    stoppedEarly: boolean;
  }): void {
    const { tenantId, latencyMs, iterations, stoppedEarly } = params;
    this.agentRunsTotal.inc({ tenant_id: tenantId, stopped_early: stoppedEarly ? '1' : '0' });
    this.agentLatencyMs.observe({ tenant_id: tenantId }, latencyMs);
    this.agentIterations.observe({ tenant_id: tenantId }, iterations);
  }
}
