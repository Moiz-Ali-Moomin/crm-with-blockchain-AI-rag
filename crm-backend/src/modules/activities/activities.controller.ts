import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RbacResource, RbacAction } from '../../common/rbac';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import {
  CreateActivitySchema,
  CreateActivityDto,
  UpdateActivitySchema,
  UpdateActivityDto,
  FilterActivitySchema,
  FilterActivityDto,
  TimelineQuerySchema,
  TimelineQueryDto,
} from './activities.dto';

@ApiTags('activities')
@ApiBearerAuth('JWT')
@Controller('activities')
@UseGuards(RolesGuard, RbacGuard)
@UseInterceptors(AuditLogInterceptor)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get('timeline')
  @RequirePermission(RbacResource.ACTIVITY, RbacAction.READ)
  @ApiOperation({ summary: 'Get activity timeline for a specific entity (polymorphic)' })
  async getTimeline(
    @Query(new ZodValidationPipe(TimelineQuerySchema)) query: TimelineQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.activitiesService.getTimeline(user, query);
  }

  @Get()
  @RequirePermission(RbacResource.ACTIVITY, RbacAction.READ)
  @ApiOperation({ summary: 'List activities with filters and pagination' })
  async findAll(
    @Query(new ZodValidationPipe(FilterActivitySchema)) filters: FilterActivityDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.activitiesService.findAll(user, filters);
  }

  @Get(':id')
  @RequirePermission(RbacResource.ACTIVITY, RbacAction.READ)
  @ApiOperation({ summary: 'Get activity by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.activitiesService.findById(user, id);
  }

  @Post()
  @RequirePermission(RbacResource.ACTIVITY, RbacAction.CREATE)
  @ApiOperation({ summary: 'Log a new activity' })
  async create(
    @Body(new ZodValidationPipe(CreateActivitySchema)) dto: CreateActivityDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.activitiesService.create(user, dto);
  }

  @Put(':id')
  @RequirePermission(RbacResource.ACTIVITY, RbacAction.UPDATE)
  @ApiOperation({ summary: 'Update an activity' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateActivitySchema)) dto: UpdateActivityDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.activitiesService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(RbacResource.ACTIVITY, RbacAction.DELETE)
  @ApiOperation({ summary: 'Delete an activity' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.activitiesService.delete(user, id);
  }
}
