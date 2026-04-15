/**
 * GetKanbanBoardQuery
 * GetForecastQuery
 *
 * Read-only queries for Kanban board and revenue forecast views.
 * These are deliberately simple — they delegate entirely to the repository
 * which contains the Prisma aggregation logic.
 *
 * In a full CQRS setup these could hit a read replica or read-optimised
 * projection. For now they share the write-side repository port.
 */

import { Inject, Injectable } from '@nestjs/common';
import {
  DEAL_REPOSITORY_PORT,
  DealRepositoryPort,
  KanbanBoard,
  ForecastResult,
} from '../ports/deal.repository.port';

@Injectable()
export class GetKanbanBoardQuery {
  constructor(
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
  ) {}

  execute(pipelineId: string): Promise<KanbanBoard> {
    return this.dealRepo.getKanbanBoard(pipelineId);
  }
}

@Injectable()
export class GetForecastQuery {
  constructor(
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
  ) {}

  execute(pipelineId: string): Promise<ForecastResult> {
    return this.dealRepo.getForecast(pipelineId);
  }
}
