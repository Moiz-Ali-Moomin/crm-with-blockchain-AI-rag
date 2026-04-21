/**
 * UpdateDealUseCase
 *
 * Updates mutable fields of an existing deal (does NOT handle stage moves).
 * Stage changes go through MoveDealStageUseCase to enforce the state machine.
 *
 * Flow:
 *   1. Verify deal exists
 *   2. Persist field updates
 *   3. Publish webhook event
 *   4. Return updated deal
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEAL_REPOSITORY_PORT,
  DealRepositoryPort,
} from '../ports/deal.repository.port';
import {
  EVENT_PUBLISHER_PORT,
  EventPublisherPort,
} from '../ports/event-publisher.port';
import { NotFoundError } from '../../../../shared/errors/domain.errors';
import { UpdateDealDto } from '../../deals.dto';
import { toEventPayload } from '../mappers/deal-event-payload.mapper';


@Injectable()
export class UpdateDealUseCase {
  private readonly logger = new Logger(UpdateDealUseCase.name);

  constructor(
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly events: EventPublisherPort,
  ) {}

  async execute(id: string, dto: UpdateDealDto, tenantId: string) {
    // 1. Guard: deal must exist
    const existing = await this.dealRepo.findById(id);
    if (!existing) throw new NotFoundError('Deal', id);

    // 2. Auto-stamp wonAt / lostAt when status transitions via the generic endpoint.
    //    MoveDealStageUseCase handles this via the domain entity; here we ensure the
    //    analytics revenue query (which filters on wonAt) is never silently broken.
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.status === 'WON' && existing.status !== 'WON' && !existing.wonAt) {
      updateData.wonAt = new Date();
    }
    if (dto.status === 'LOST' && existing.status !== 'LOST' && !existing.lostAt) {
      updateData.lostAt = new Date();
    }

    // 3. Persist updates
    const updated = await this.dealRepo.update(id, updateData as any);

    // 4. Async side-effects (non-blocking)
    this.events
      .publishWebhook(tenantId, 'DEAL_UPDATED', toEventPayload(updated))
      .catch((err: Error) =>
        this.logger.error(`Webhook publish failed for deal ${id}: ${err.message}`),
      );

    this.logger.log(`Deal updated: ${id}`);

    return updated;
  }
}
