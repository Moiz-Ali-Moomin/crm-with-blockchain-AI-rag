import { Injectable, Logger } from '@nestjs/common';
import { trace, SpanStatusCode, Attributes } from '@opentelemetry/api';
import { RagService } from '../ai/rag.service';
import { DealsService } from '../deals/deals.service';
import { TasksService } from '../tasks/tasks.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolPermissionService } from './tool-permission.service';
import { McpMetricsService, ToolCallStatus } from './mcp-metrics.service';
import { CreateTaskDto } from '../tasks/tasks.dto';

export interface ToolExecutionContext {
  tenantId: string;
  userId: string;
  userRole: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

const PRIORITY_MAP: Record<string, CreateTaskDto['priority']> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  urgent: 'URGENT',
};

const ENTITY_TYPE_MAP: Record<string, CreateTaskDto['entityType']> = {
  deal: 'DEAL',
  contact: 'CONTACT',
  lead: 'LEAD',
  company: 'COMPANY',
};

const tracer = trace.getTracer('crm-mcp');

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolPermission: ToolPermissionService,
    private readonly ragService: RagService,
    private readonly dealsService: DealsService,
    private readonly tasksService: TasksService,
    private readonly mcpMetrics: McpMetricsService,
  ) {}

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const spanAttrs: Attributes = {
      'mcp.tool_name': toolName,
      'crm.tenant_id': ctx.tenantId,
      'crm.user_id': ctx.userId,
      'crm.user_role': ctx.userRole,
    };

    return tracer.startActiveSpan(`mcp.tool.${toolName}`, { attributes: spanAttrs }, async (span) => {
      const start = Date.now();
      let status: ToolCallStatus = 'success';

      try {
        const tool = this.toolRegistry.get(toolName);

        if (!tool) {
          this.logger.warn(`Unknown tool requested: "${toolName}"`);
          status = 'not_found';
          span.setStatus({ code: SpanStatusCode.ERROR, message: `Unknown tool: "${toolName}"` });
          return { success: false, error: `Unknown tool: "${toolName}"` };
        }

        // 1. Role-based permission check
        this.toolPermission.checkRole(tool, ctx.userRole);

        // 2. Zod input validation + sanitization
        const safeInput = tool.inputSchema
          ? this.toolPermission.validateInput(toolName, input, tool.inputSchema)
          : input;

        // 3. Dispatch to executor
        let result: ToolExecutionResult;
        switch (toolName) {
          case 'search_crm':
            result = await this.executeSearchCrm(safeInput, ctx);
            break;
          case 'get_deal':
            result = await this.executeGetDeal(safeInput);
            break;
          case 'create_task':
            result = await this.executeCreateTask(safeInput, ctx);
            break;
          default:
            status = 'not_found';
            span.setStatus({ code: SpanStatusCode.ERROR, message: `No executor for: "${toolName}"` });
            return { success: false, error: `No executor registered for tool: "${toolName}"` };
        }

        span.setAttribute('mcp.tool_success', result.success);
        if (!result.success) {
          status = 'error';
          span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        return result;
      } catch (err) {
        // Re-throw NestJS HTTP exceptions so the caller gets a proper HTTP response.
        if (
          err != null &&
          typeof err === 'object' &&
          'status' in err &&
          typeof (err as { status: unknown }).status === 'number'
        ) {
          const httpStatus = (err as { status: number }).status;
          status = httpStatus === 403 ? 'permission_denied' : 'validation_error';
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          throw err;
        }

        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Tool "${toolName}" execution failed: ${message}`);
        status = 'error';
        span.recordException(err instanceof Error ? err : new Error(message));
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        return { success: false, error: message };
      } finally {
        const latencyMs = Date.now() - start;
        span.setAttribute('mcp.tool_latency_ms', latencyMs);
        span.end();

        this.mcpMetrics.recordToolCall({
          toolName,
          tenantId: ctx.tenantId,
          status,
          latencyMs,
        });

        this.logger.debug(
          `[MCP] tool="${toolName}" tenant="${ctx.tenantId}" status="${status}" latency=${latencyMs}ms`,
        );
      }
    });
  }

  private async executeSearchCrm(
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const query = input['query'] as string;
    const rawLimit = input['limit'] !== undefined ? parseInt(input['limit'] as string, 10) : 10;
    const topK = Number.isNaN(rawLimit) ? 10 : Math.min(Math.max(rawLimit, 1), 50);

    const result = await this.ragService.query({
      tenantId: ctx.tenantId,
      query,
      topK,
    });

    return {
      success: true,
      data: {
        answer: result.answer,
        sources: result.sources,
        confidence: result.confidence,
        fromCache: result.fromCache,
      },
    };
  }

  private async executeGetDeal(
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const dealId = input['deal_id'] as string;
    const deal = await this.dealsService.findById(dealId);
    return { success: true, data: deal };
  }

  private async executeCreateTask(
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const dto: CreateTaskDto = {
      title: input['title'] as string,
      status: 'TODO',
      priority: PRIORITY_MAP[input['priority'] as string] ?? 'MEDIUM',
      ...(input['description'] !== undefined && { description: input['description'] as string }),
      ...(input['due_date'] !== undefined && { dueDate: input['due_date'] as string }),
      ...(input['related_entity_type'] !== undefined && {
        entityType: ENTITY_TYPE_MAP[input['related_entity_type'] as string],
      }),
      ...(input['related_entity_id'] !== undefined && { entityId: input['related_entity_id'] as string }),
      ...(input['assigned_to_user_id'] !== undefined && { assigneeId: input['assigned_to_user_id'] as string }),
    };

    const task = await this.tasksService.create(dto, ctx.userId, ctx.tenantId);

    return {
      success: true,
      data: { id: task.id, title: task.title, status: task.status },
    };
  }
}
