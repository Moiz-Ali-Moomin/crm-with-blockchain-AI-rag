import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { z } from 'zod';

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  triggerType: z.enum([
    'LEAD_CREATED', 'LEAD_STATUS_CHANGED', 'LEAD_ASSIGNED',
    'CONTACT_CREATED', 'DEAL_CREATED', 'DEAL_STAGE_CHANGED',
    'DEAL_WON', 'DEAL_LOST', 'TASK_OVERDUE',
    'TICKET_CREATED', 'TICKET_STATUS_CHANGED',
  ]),
  triggerConfig: z.record(z.unknown()).default({}),
  conditions: z.object({
    logic: z.enum(['AND', 'OR']).default('AND'),
    conditions: z.array(z.unknown()).default([]),
  }),
  actions: z.array(z.object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.unknown()),
  })).default([]),
});

@ApiTags('automation')
@ApiBearerAuth('JWT')
@Controller('automation/workflows')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get()
  async findAll(@CurrentUser('tenantId') tenantId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.automationService.findAll(tenantId, Number(page ?? 1), Number(limit ?? 20));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.automationService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new automation workflow' })
  async create(
    @Body(new ZodValidationPipe(CreateWorkflowSchema)) dto: z.infer<typeof CreateWorkflowSchema>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.automationService.create({ ...dto, createdById: user.id, tenantId: user.tenantId } as any);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.automationService.update(id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Enable or disable a workflow' })
  async toggle(@Param('id') id: string) {
    return this.automationService.toggleActive(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.automationService.delete(id);
  }
}
