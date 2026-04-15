/**
 * DealRepositoryPort
 *
 * Interface (port) for all deal persistence operations.
 * Use-cases depend on this abstraction — never on PrismaService directly.
 *
 * Implementations (adapters):
 *   - PrismaDealRepository (production)
 *   - InMemoryDealRepository (tests)
 */

import { FilterDealDto } from '../../deals.dto';

// ─── Read Models (returned from repository — pure data, no domain logic) ─────

export interface StageReadModel {
  id: string;
  name: string;
  color: string;
  position: number;
  probability: number;
  pipelineId: string;
  isWon: boolean;
  isLost: boolean;
}

export interface DealReadModel {
  id: string;
  title: string;
  value: unknown;       // Prisma Decimal — serialised by the controller
  currency: string;
  status: string;
  stageId: string;
  pipelineId: string;
  tenantId: string;
  ownerId: string | null;
  contactId: string | null;
  companyId: string | null;
  closingDate: Date | null;
  description: string | null;
  tags: string[];
  wonAt: Date | null;
  lostAt: Date | null;
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  stage?: StageReadModel;
  // Relations (optional, populated by specific queries)
  contact?: { id: string; firstName: string; lastName: string; email: string } | null;
  company?: { id: string; name: string } | null;
  owner?: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null;
  stageHistory?: Array<{
    toStage: { name: string; color: string };
    movedAt: Date;
  }>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface KanbanStageColumn {
  stage: StageReadModel;
  deals: DealReadModel[];
  count: number;
  totalValue: number;
}

export interface KanbanBoard {
  pipelineId: string;
  stages: KanbanStageColumn[];
}

export interface ForecastBreakdown {
  stage: string;
  probability: number;
  totalValue: number;
  forecastedValue: number;
  dealCount: number;
}

export interface ForecastResult {
  totalPipeline: number;
  totalForecast: number;
  breakdown: ForecastBreakdown[];
}

export interface StageHistoryRecord {
  dealId: string;
  tenantId: string;
  fromStageId?: string | null;
  toStageId: string;
  movedById: string;
}

export interface DealCreateData {
  title: string;
  value: number;
  currency: string;
  pipelineId: string;
  stageId: string;
  tenantId: string;
  ownerId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  closingDate?: string | null;
  description?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface DealUpdateData {
  title?: string;
  value?: number;
  currency?: string;
  status?: string;
  stageId?: string;
  ownerId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  closingDate?: string | null;
  description?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  wonAt?: Date | null;
  lostAt?: Date | null;
  lostReason?: string | null;
}

// ─── Port Interface ────────────────────────────────────────────────────────────

export const DEAL_REPOSITORY_PORT = Symbol('DEAL_REPOSITORY_PORT');

export interface DealRepositoryPort {
  // Commands
  create(data: DealCreateData): Promise<DealReadModel>;
  update(id: string, data: DealUpdateData): Promise<DealReadModel>;
  updateInTransaction(
    id: string,
    data: DealUpdateData,
    historyRecord: StageHistoryRecord,
  ): Promise<DealReadModel>;
  delete(id: string): Promise<void>;
  recordStageHistory(record: StageHistoryRecord): Promise<void>;

  // Queries
  findById(id: string): Promise<DealReadModel | null>;
  findAll(filters: FilterDealDto): Promise<PaginatedResult<DealReadModel>>;
  findStageInPipeline(stageId: string, pipelineId: string): Promise<StageReadModel | null>;
  getKanbanBoard(pipelineId: string): Promise<KanbanBoard>;
  getForecast(pipelineId: string): Promise<ForecastResult>;
}
