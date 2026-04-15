/**
 * DealsController (v1)
 *
 * Pure HTTP interface layer. Zero business logic.
 *
 * Responsibilities:
 *   - Parse & validate HTTP input (Zod)
 *   - Extract authenticated user context
 *   - Delegate to use-cases
 *   - Return use-case results (serialised automatically by NestJS)
 *
 * This controller never makes decisions — it only wires HTTP → use-cases.
 */

import {
  Controller,
  Get, Post, Patch, Delete,
  Body, Param, Query,
  UseGuards, UseInterceptors,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AuditLogInterceptor } from '../../../common/interceptors/audit-log.interceptor';
import {
  CreateDealSchema, CreateDealDto,
  UpdateDealSchema, UpdateDealDto,
  FilterDealSchema, FilterDealDto,
  MoveDealStageSchema, MoveDealStageDto,
} from '../deals.dto';
import { CreateDealUseCase } from '../application/use-cases/create-deal.use-case';
import { MoveDealStageUseCase } from '../application/use-cases/move-deal-stage.use-case';
import { UpdateDealUseCase } from '../application/use-cases/update-deal.use-case';
import { DeleteDealUseCase } from '../application/use-cases/delete-deal.use-case';
import { GetKanbanBoardQuery, GetForecastQuery } from '../application/queries/deal.queries';
import {
  DEAL_REPOSITORY_PORT,
  DealRepositoryPort,
} from '../application/ports/deal.repository.port';
import { Inject } from '@nestjs/common';
import { NotFoundError } from '../../../shared/errors/domain.errors';

@ApiTags('deals')
@ApiBearerAuth('JWT')
@Controller('deals')
@UseGuards(RolesGuard)
@UseInterceptors(AuditLogInterceptor)
export class DealsControllerV1 {
  constructor(
    private readonly createDeal: CreateDealUseCase,
    private readonly moveDealStage: MoveDealStageUseCase,
    private readonly updateDeal: UpdateDealUseCase,
    private readonly deleteDeal: DeleteDealUseCase,
    private readonly kanbanQuery: GetKanbanBoardQuery,
    private readonly forecastQuery: GetForecastQuery,
    @Inject(DEAL_REPOSITORY_PORT)
    private readonly dealRepo: DealRepositoryPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List deals with filters and pagination' })
  findAll(@Query(new ZodValidationPipe(FilterDealSchema)) filters: FilterDealDto) {
    return this.dealRepo.findAll(filters);
  }

  @Get('kanban/:pipelineId')
  @ApiOperation({ summary: 'Get Kanban board data: deals grouped by stage' })
  getKanbanBoard(@Param('pipelineId') pipelineId: string) {
    return this.kanbanQuery.execute(pipelineId);
  }

  @Get('forecast/:pipelineId')
  @ApiOperation({ summary: 'Revenue forecast for pipeline (weighted by stage probability)' })
  getForecast(@Param('pipelineId') pipelineId: string) {
    return this.forecastQuery.execute(pipelineId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get deal by ID with full relations' })
  async findOne(@Param('id') id: string) {
    const deal = await this.dealRepo.findById(id);
    if (!deal) throw new NotFoundError('Deal', id);
    return deal;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new deal' })
  create(
    @Body(new ZodValidationPipe(CreateDealSchema)) dto: CreateDealDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.createDeal.execute(dto, user.id, user.tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update deal fields' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDealSchema)) dto: UpdateDealDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.updateDeal.execute(id, dto, user.tenantId);
  }

  @Patch(':id/move-stage')
  @ApiOperation({ summary: 'Move deal to a different stage (Kanban drag-and-drop)' })
  moveStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MoveDealStageSchema)) dto: MoveDealStageDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.moveDealStage.execute(id, dto, user.id, user.tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a deal (WON deals cannot be deleted)' })
  remove(@Param('id') id: string) {
    return this.deleteDeal.execute(id);
  }
}
