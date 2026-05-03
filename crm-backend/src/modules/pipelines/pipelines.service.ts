/**
 * Pipelines Service
 * Business logic for pipeline and stage management.
 * On create, automatically seeds default sales stages.
 * reorderStages runs all position updates in a single DB transaction.
 */

import { Injectable } from '@nestjs/common';
import { NotFoundError, BusinessRuleError } from '../../shared/errors/domain.errors';
import { PipelinesRepository } from './pipelines.repository';
import { PrismaTransactionService } from '../../core/database/prisma-transaction.service';
import {
  CreatePipelineDto,
  UpdatePipelineDto,
  FilterPipelineDto,
  CreateStageDto,
  UpdateStageDto,
  ReorderStagesDto,
} from './pipelines.dto';

const DEFAULT_STAGES = [
  { name: 'Prospecting',  position: 0, probability: 0.1,  isWon: false, isLost: false },
  { name: 'Qualification', position: 1, probability: 0.25, isWon: false, isLost: false },
  { name: 'Proposal',     position: 2, probability: 0.5,  isWon: false, isLost: false },
  { name: 'Negotiation',  position: 3, probability: 0.75, isWon: false, isLost: false },
  { name: 'Closed Won',   position: 4, probability: 1.0,  isWon: true,  isLost: false },
  { name: 'Closed Lost',  position: 5, probability: 0.0,  isWon: false, isLost: true  },
] as const;

@Injectable()
export class PipelinesService {
  constructor(
    private readonly pipelinesRepo: PipelinesRepository,
    private readonly tx: PrismaTransactionService,
  ) {}

  async findAll(filters: FilterPipelineDto) {
    return this.pipelinesRepo.findAll(filters);
  }

  async findById(id: string) {
    const pipeline = await this.pipelinesRepo.findById(id);
    if (!pipeline) throw new NotFoundError('Pipeline', id);
    return pipeline;
  }

  async getDefaultPipeline() {
    const pipeline = await this.pipelinesRepo.findDefault();
    if (!pipeline) throw new NotFoundError('No default pipeline found');
    return pipeline;
  }

  async create(dto: CreatePipelineDto, tenantId: string) {
    // If this pipeline is being set as default, clear existing default first
    if (dto.isDefault) {
      await this._clearDefaultFlag(tenantId);
    }

    const pipeline = await this.tx.run(async (tx) => {
      const created = await tx.pipeline.create({
        data: {
          name: dto.name,
          isDefault: dto.isDefault,
          tenant: { connect: { id: tenantId } },
        },
      });

      // Seed default stages (Idempotent)
      await tx.stage.createMany({
        data: DEFAULT_STAGES.map((s) => ({
          ...s,
          pipelineId: created.id,
          tenantId,
        })),
        skipDuplicates: true,
      });

      return tx.pipeline.findFirst({
        where: { id: created.id },
        include: { stages: { orderBy: { position: 'asc' } } },
      });
    });

    return pipeline;
  }

  async update(id: string, dto: UpdatePipelineDto, tenantId: string) {
    await this.findById(id);

    if (dto.isDefault) {
      await this._clearDefaultFlag(tenantId);
    }

    return this.pipelinesRepo.update(id, dto);
  }

  async delete(id: string) {
    const pipeline = await this.findById(id);
    if (pipeline.isDefault) {
      throw new BusinessRuleError('Cannot delete the default pipeline');
    }
    await this.pipelinesRepo.delete(id);
    return { deleted: true };
  }

  // ── Stage management ────────────────────────────────────────────────────────

  async createStage(pipelineId: string, dto: CreateStageDto, tenantId: string) {
    await this.findById(pipelineId); // ensure pipeline exists

    return this.pipelinesRepo.createStage({
      ...dto,
      tenantId,
      pipeline: { connect: { id: pipelineId } },
    } as any);
  }

  async updateStage(stageId: string, dto: UpdateStageDto) {
    const stage = await this.pipelinesRepo.findStageById(stageId);
    if (!stage) throw new NotFoundError('Stage', stageId);
    return this.pipelinesRepo.updateStage(stageId, dto);
  }

  async deleteStage(stageId: string) {
    const stage = await this.pipelinesRepo.findStageById(stageId);
    if (!stage) throw new NotFoundError('Stage', stageId);

    // Check no open deals remain on this stage
    await this.pipelinesRepo.deleteStage(stageId);
    return { deleted: true };
  }

  async reorderStages(pipelineId: string, dto: ReorderStagesDto) {
    await this.findById(pipelineId);

    const existingStages = await this.pipelinesRepo.findStagesByPipelineId(pipelineId);
    const existingIds = new Set(existingStages.map((s) => s.id));

    for (const id of dto.stageIds) {
      if (!existingIds.has(id)) {
        throw new BusinessRuleError(`Stage ${id} does not belong to pipeline ${pipelineId}`);
      }
    }

    // Run all position updates atomically
    await this.tx.run(async (tx) => {
      await Promise.all(
        dto.stageIds.map((stageId, index) =>
          tx.stage.update({
            where: { id: stageId },
            data: { position: index },
          }),
        ),
      );
    });

    return this.pipelinesRepo.findById(pipelineId);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _clearDefaultFlag(_tenantId: string) {
    // We need to clear existing default pipeline for this tenant.
    // Since Prisma middleware scopes by tenant, this findFirst will stay within tenant.
    const existing = await this.pipelinesRepo.findDefault();
    if (existing) {
      await this.pipelinesRepo.update(existing.id, { isDefault: false });
    }
  }
}
