/**
 * DealsService — Backward-Compatibility Facade
 *
 * This thin facade maintains backward compatibility for any modules that
 * import DealsService directly (e.g. AnalyticsModule, AutomationModule).
 *
 * It delegates ALL calls to the appropriate use-cases or the repository port.
 * No business logic lives here — it is purely a proxy.
 *
 * Deprecation plan:
 *   - Phase 1 (now): Facade proxies to use-cases ✅
 *   - Phase 2 (next sprint): Update all importers to inject use-cases directly
 *   - Phase 3: Remove this file
 *
 * @deprecated Inject individual use-cases directly instead of this service.
 */

import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CreateDealUseCase } from './application/use-cases/create-deal.use-case';
import { MoveDealStageUseCase } from './application/use-cases/move-deal-stage.use-case';
import { UpdateDealUseCase } from './application/use-cases/update-deal.use-case';
import { DeleteDealUseCase } from './application/use-cases/delete-deal.use-case';
import {
  DEAL_REPOSITORY_PORT,
  DealRepositoryPort,
} from './application/ports/deal.repository.port';
import { NotFoundError } from '../../shared/errors/domain.errors';
import { CreateDealDto, UpdateDealDto, FilterDealDto, MoveDealStageDto } from './deals.dto';

@Injectable()
export class DealsService {
  constructor(
    private readonly createDealUseCase: CreateDealUseCase,
    private readonly moveDealStageUseCase: MoveDealStageUseCase,
    private readonly updateDealUseCase: UpdateDealUseCase,
    private readonly deleteDealUseCase: DeleteDealUseCase,
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
  ) {}

  /** @deprecated Use FindAll query handler directly */
  findAll(filters: FilterDealDto) {
    return this.dealRepo.findAll(filters);
  }

  /** @deprecated Use dealRepo.findById + NotFoundError directly */
  async findById(id: string) {
    const deal = await this.dealRepo.findById(id);
    if (!deal) throw new NotFoundError('Deal', id);
    return deal;
  }

  /** @deprecated Use GetKanbanBoardQuery */
  getKanbanBoard(pipelineId: string) {
    return this.dealRepo.getKanbanBoard(pipelineId);
  }

  /** @deprecated Use GetForecastQuery */
  getForecast(pipelineId: string) {
    return this.dealRepo.getForecast(pipelineId);
  }

  /** @deprecated Inject CreateDealUseCase directly */
  create(dto: CreateDealDto, ownerId: string, tenantId: string) {
    return this.createDealUseCase.execute(dto, ownerId, tenantId);
  }

  /** @deprecated Inject UpdateDealUseCase directly */
  update(id: string, dto: UpdateDealDto, tenantId = '') {
    return this.updateDealUseCase.execute(id, dto, tenantId);
  }

  /** @deprecated Inject MoveDealStageUseCase directly */
  moveStage(id: string, dto: MoveDealStageDto, actorId: string, tenantId: string) {
    return this.moveDealStageUseCase.execute(id, dto, actorId, tenantId);
  }

  /** @deprecated Inject DeleteDealUseCase directly */
  delete(id: string) {
    return this.deleteDealUseCase.execute(id);
  }
}
