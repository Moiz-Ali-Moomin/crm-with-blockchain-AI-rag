/**
 * PrismaDealRepository
 *
 * Implements DealRepositoryPort using Prisma ORM.
 * This is the ONLY file allowed to import PrismaService in the Deals module.
 *
 * Contains all SQL/Prisma logic previously split between:
 *   - DealsRepository (basic CRUD)
 *   - DealsService (kanban, forecast, stage validation, history)
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { PrismaTransactionService } from '../../../../core/database/prisma-transaction.service';
import {
  DealRepositoryPort,
  DealReadModel,
  DealCreateData,
  DealUpdateData,
  StageReadModel,
  StageHistoryRecord,
  KanbanBoard,
  ForecastResult,
  PaginatedResult,
} from '../../application/ports/deal.repository.port';
import { FilterDealDto } from '../../deals.dto';
import {
  buildPrismaSkipTake,
  buildPaginatedResult,
} from '../../../../common/dto/pagination.dto';

// Standard relation includes reused across queries
const DEAL_INCLUDES = {
  stage:    true,
  pipeline: { select: { id: true, name: true } },
  contact:  { select: { id: true, firstName: true, lastName: true, email: true } },
  company:  { select: { id: true, name: true } },
  owner:    { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
} as const;

@Injectable()
export class PrismaDealRepository implements DealRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: PrismaTransactionService,
  ) {}

  // ─── Commands ──────────────────────────────────────────────────────────────

  async create(data: DealCreateData): Promise<DealReadModel> {
    const { pipelineId, stageId, contactId, companyId, tenantId, ownerId, ...rest } = data;

    return this.prisma.deal.create({
      data: {
        ...rest,
        customFields: rest.customFields as Prisma.InputJsonValue,
        tenant:   { connect: { id: tenantId } },
        pipeline: { connect: { id: pipelineId } },
        stage:    { connect: { id: stageId } },
        ...(ownerId   && { owner:   { connect: { id: ownerId } } }),
        ...(contactId && { contact: { connect: { id: contactId } } }),
        ...(companyId && { company: { connect: { id: companyId } } }),
      },
    }) as Promise<DealReadModel>;
  }

  async update(id: string, data: DealUpdateData): Promise<DealReadModel> {
    return this.prisma.deal.update({
      where: { id },
      data: data as Prisma.DealUpdateInput,
    }) as Promise<DealReadModel>;
  }

  /**
   * Atomically updates the deal AND records stage history in one transaction.
   * Called exclusively by MoveDealStageUseCase.
   */
  async updateInTransaction(
    id: string,
    data: DealUpdateData,
    historyRecord: StageHistoryRecord,
  ): Promise<DealReadModel> {
    return this.tx.run(async (client) => {
      const updated = await client.deal.update({
        where: { id },
        data: data as Prisma.DealUpdateInput,
        include: {
          stage:   true,
          contact: { select: { id: true, firstName: true, lastName: true } },
          owner:   { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await client.dealStageHistory.create({
        data: {
          dealId:     historyRecord.dealId,
          tenantId:   historyRecord.tenantId,
          fromStageId: historyRecord.fromStageId,
          toStageId:  historyRecord.toStageId,
          movedById:  historyRecord.movedById,
        },
      });

      return updated;
    }) as Promise<DealReadModel>;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.deal.delete({ where: { id } });
  }

  async recordStageHistory(record: StageHistoryRecord): Promise<void> {
    await this.prisma.dealStageHistory.create({
      data: {
        dealId:      record.dealId,
        tenantId:    record.tenantId,
        toStageId:   record.toStageId,
        movedById:   record.movedById,
        ...(record.fromStageId && { fromStageId: record.fromStageId }),
      },
    });
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async findById(id: string): Promise<DealReadModel | null> {
    return this.prisma.deal.findFirst({
      where: { id },
      include: {
        stage:    true,
        pipeline: true,
        contact:  { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        company:  { select: { id: true, name: true } },
        owner:    { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        stageHistory: {
          include: { toStage: { select: { name: true, color: true } } },
          orderBy: { movedAt: 'desc' },
        },
      },
    }) as Promise<DealReadModel | null>;
  }

  async findAll(filters: FilterDealDto): Promise<PaginatedResult<DealReadModel>> {
    const {
      page, limit, sortBy, sortOrder, search,
      pipelineId, stageId, status, ownerId, contactId, minValue, maxValue,
    } = filters;

    const where: Prisma.DealWhereInput = {
      ...(pipelineId && { pipelineId }),
      ...(stageId    && { stageId }),
      ...(status     && { status }),
      ...(ownerId    && { ownerId }),
      ...(contactId  && { contactId }),
      ...(minValue !== undefined && { value: { gte: minValue } }),
      ...(maxValue !== undefined && { value: { lte: maxValue } }),
      ...(search && { title: { contains: search, mode: 'insensitive' as const } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include:  DEAL_INCLUDES,
        orderBy:  { [sortBy ?? 'createdAt']: sortOrder },
        ...buildPrismaSkipTake(page, limit),
      }),
      this.prisma.deal.count({ where }),
    ]);

    return buildPaginatedResult(data as DealReadModel[], total, page, limit);
  }

  async findStageInPipeline(
    stageId: string,
    pipelineId: string,
  ): Promise<StageReadModel | null> {
    return this.prisma.stage.findFirst({
      where: { id: stageId, pipelineId },
    }) as Promise<StageReadModel | null>;
  }

  async getKanbanBoard(pipelineId: string): Promise<KanbanBoard> {
    const stages = await this.prisma.stage.findMany({
      where:   { pipelineId },
      orderBy: { position: 'asc' },
    });

    const deals = await this.prisma.deal.findMany({
      where: { pipelineId, status: 'OPEN' },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, name: true } },
        owner:   { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const kanbanStages = stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stageId === stage.id);
      return {
        stage:      stage as StageReadModel,
        deals:      stageDeals as DealReadModel[],
        count:      stageDeals.length,
        totalValue: stageDeals.reduce((sum, d) => sum + Number(d.value), 0),
      };
    });

    return { pipelineId, stages: kanbanStages };
  }

  async getForecast(pipelineId: string): Promise<ForecastResult> {
    const stages = await this.prisma.stage.findMany({
      where:   { pipelineId },
      orderBy: { position: 'asc' },
    });

    const aggregates = await Promise.all(
      stages.map((s) =>
        this.prisma.deal.aggregate({
          where: { stageId: s.id, status: 'OPEN' },
          _count: { id: true },
          _sum:   { value: true },
        }),
      ),
    );

    let totalForecast = 0;
    let totalPipeline = 0;

    const breakdown = stages.map((stage, i) => {
      const agg          = aggregates[i];
      const stageTotal   = Number(agg._sum.value ?? 0);
      const dealCount    = agg._count.id;
      const stageForecast = stageTotal * stage.probability;
      totalForecast += stageForecast;
      totalPipeline += stageTotal;

      return {
        stage:          stage.name,
        probability:    stage.probability,
        totalValue:     stageTotal,
        forecastedValue: stageForecast,
        dealCount,
      };
    });

    return { totalPipeline, totalForecast, breakdown };
  }
}
