/**
 * Automation Service
 * Manages workflow CRUD and orchestrates the trigger evaluation pipeline.
 */

import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../shared/errors/domain.errors';
import { PrismaService } from '../../core/database/prisma.service';
import { ConditionEvaluator } from './engine/condition-evaluator';
import { ActionExecutor } from './engine/action-executor';
import { AutomationTriggerPayload, WorkflowConditionGroup } from './engine/automation-event.types';
import { buildPaginatedResult, buildPrismaSkipTake } from '../../common/dto/pagination.dto';

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conditionEvaluator: ConditionEvaluator,
    private readonly actionExecutor: ActionExecutor,
  ) {}

  async findAll(tenantId: string, page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.workflow.findMany({
        orderBy: { createdAt: 'desc' },
        ...buildPrismaSkipTake(page, limit),
        include: {
          executions: {
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.workflow.count(),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string) {
    const workflow = await this.prisma.workflow.findFirst({ where: { id } });
    if (!workflow) throw new NotFoundError('Workflow', id);
    return workflow;
  }

  async create(data: {
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    conditions: WorkflowConditionGroup;
    actions: Array<{ id: string; type: string; config: Record<string, unknown> }>;
    createdById: string;
    tenantId: string;
  }) {
    return this.prisma.workflow.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        description: data.description,
        triggerType: data.triggerType as any,
        triggerConfig: data.triggerConfig as any,
        conditions: data.conditions as any,
        actions: data.actions as any,
        createdById: data.createdById,
      },
    });
  }

  async update(id: string, dto: Partial<{
    name: string;
    description: string;
    triggerConfig: Record<string, unknown>;
    conditions: Record<string, unknown>;
    actions: unknown[];
  }>) {
    await this.findById(id);
    return this.prisma.workflow.update({ where: { id }, data: dto as any });
  }

  async toggleActive(id: string) {
    const workflow = await this.findById(id);
    return this.prisma.workflow.update({
      where: { id },
      data: { isActive: !workflow.isActive },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    await this.prisma.workflow.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Main automation evaluation entry point.
   * Called by AutomationWorker when processing queue jobs.
   *
   * Flow:
   * 1. Find all active workflows matching the event trigger for this tenant
   * 2. Evaluate conditions for each matching workflow
   * 3. Execute actions for workflows where conditions pass
   * 4. Record execution result
   */
  async processEvent(payload: AutomationTriggerPayload): Promise<void> {
    const { tenantId, event, data } = payload;

    // Find active workflows for this event type in this tenant
    const workflows = await this.prisma.withoutTenantScope(() =>
      this.prisma.workflow.findMany({
        where: {
          tenantId,
          isActive: true,
          triggerType: event as any,
        },
      }),
    );

    for (const workflow of workflows) {
      const executionRecord = await this.prisma.withoutTenantScope(() =>
        this.prisma.workflowExecution.create({
          data: {
            workflowId: workflow.id,
            tenantId,
            status: 'RUNNING',
            triggerData: payload as any,
          },
        }),
      );

      try {
        // Evaluate conditions
        const conditionsPass = this.evaluateWorkflowConditions(
          workflow.conditions as any,
          data,
        );

        if (!conditionsPass) {
          await this.prisma.withoutTenantScope(() =>
            this.prisma.workflowExecution.update({
              where: { id: executionRecord.id },
              data: { status: 'SKIPPED', completedAt: new Date() },
            }),
          );
          continue;
        }

        // Execute actions sequentially
        const actions = (workflow.actions as any[]) ?? [];
        const actionResults: any[] = [];

        for (const action of actions) {
          const result = await this.actionExecutor.execute(action, data, tenantId);
          actionResults.push(result);

          // Stop execution if a critical action fails
          if (!result.success && action.stopOnFailure) break;
        }

        // Record success
        await this.prisma.withoutTenantScope(() =>
          this.prisma.workflowExecution.update({
            where: { id: executionRecord.id },
            data: {
              status: actionResults.every((r) => r.success) ? 'SUCCESS' : 'FAILED',
              actionResults: actionResults as any,
              completedAt: new Date(),
            },
          }),
        );

        // Update workflow stats
        await this.prisma.withoutTenantScope(() =>
          this.prisma.workflow.update({
            where: { id: workflow.id },
            data: {
              runCount: { increment: 1 },
              lastRunAt: new Date(),
            },
          }),
        );
      } catch (error) {
        await this.prisma.withoutTenantScope(() =>
          this.prisma.workflowExecution.update({
            where: { id: executionRecord.id },
            data: {
              status: 'FAILED',
              errorMessage: (error as Error).message,
              completedAt: new Date(),
            },
          }),
        );

        await this.prisma.withoutTenantScope(() =>
          this.prisma.workflow.update({
            where: { id: workflow.id },
            data: { errorCount: { increment: 1 } },
          }),
        );
      }
    }
  }

  private evaluateWorkflowConditions(
    conditions: WorkflowConditionGroup | null,
    data: Record<string, unknown>,
  ): boolean {
    // If no conditions defined, always execute
    if (!conditions || !(conditions as any).conditions?.length) return true;
    return this.conditionEvaluator.evaluate(conditions, data);
  }
}
