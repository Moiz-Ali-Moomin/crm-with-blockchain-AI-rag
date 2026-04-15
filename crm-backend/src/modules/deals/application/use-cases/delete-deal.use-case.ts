/**
 * DeleteDealUseCase
 *
 * Deletes a deal with a business guard:
 *   - A deal with status WON cannot be deleted (immutable on-chain record).
 *
 * Flow:
 *   1. Load deal (404 if missing)
 *   2. Guard: WON deals cannot be deleted
 *   3. Delete from persistence
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEAL_REPOSITORY_PORT,
  DealRepositoryPort,
} from '../ports/deal.repository.port';
import { NotFoundError } from '../../../../shared/errors/domain.errors';
import { DealEntity } from '../../domain/entities/deal.entity';
import { CannotDeleteConfirmedDealError } from '../../domain/errors/deal.errors';

@Injectable()
export class DeleteDealUseCase {
  private readonly logger = new Logger(DeleteDealUseCase.name);

  constructor(
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
  ) {}

  async execute(id: string): Promise<{ deleted: true }> {
    const existing = await this.dealRepo.findById(id);
    if (!existing) throw new NotFoundError('Deal', id);

    // Domain guard: rehydrate entity to use domain logic
    const entity = DealEntity.rehydrate({
      id:         existing.id,
      title:      existing.title,
      value:      Number(existing.value),
      currency:   existing.currency,
      status:     existing.status,
      stageId:    existing.stageId,
      pipelineId: existing.pipelineId,
      tenantId:   existing.tenantId,
      ownerId:    existing.ownerId,
      wonAt:      existing.wonAt,
      lostAt:     existing.lostAt,
    });

    // WON deals have an immutable blockchain record — deleting them would
    // create a gap in the audit trail even if the on-chain hash remains.
    if (entity.isBlockchainEligible()) {
      throw new CannotDeleteConfirmedDealError(id);
    }

    await this.dealRepo.delete(id);

    this.logger.log(`Deal deleted: ${id}`);

    return { deleted: true };
  }
}
