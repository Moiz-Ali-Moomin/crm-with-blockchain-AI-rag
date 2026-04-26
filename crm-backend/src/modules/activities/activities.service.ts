import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotFoundError } from '../../shared/errors/domain.errors';
import { ActivitiesRepository } from './activities.repository';
import { WsService, WS_EVENTS } from '../../core/websocket/ws.service';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS, embeddingJobOptions } from '../../core/queue/queue.constants';
import { CreateActivityDto, UpdateActivityDto, FilterActivityDto, TimelineQueryDto } from './activities.dto';
import { RbacService, RbacResource, RbacAction } from '../../common/rbac';
import { JwtUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    private readonly activitiesRepo: ActivitiesRepository,
    private readonly rbacService: RbacService,
    private readonly ws: WsService,
    @InjectQueue(QUEUE_NAMES.AI_EMBEDDING) private readonly embeddingQueue: Queue,
  ) {}

  async getTimeline(user: JwtUser, query: TimelineQueryDto) {
    this.rbacService.checkPermission(user, RbacResource.ACTIVITY, RbacAction.READ);
    return this.activitiesRepo.getTimeline(query);
  }

  async findAll(user: JwtUser, filters: FilterActivityDto) {
    return this.rbacService.withRBAC(
      user, RbacResource.ACTIVITY, RbacAction.READ,
      (scope) => this.activitiesRepo.findAll(filters, scope),
    );
  }

  async findById(user: JwtUser, id: string) {
    return this.rbacService.withRBAC(
      user, RbacResource.ACTIVITY, RbacAction.READ,
      async (scope) => {
        const activity = await this.activitiesRepo.findById(id, scope);
        if (!activity) throw new NotFoundError('Activity', id);
        return activity;
      },
    );
  }

  async create(user: JwtUser, dto: CreateActivityDto) {
    return this.rbacService.withRBAC(
      user, RbacResource.ACTIVITY, RbacAction.CREATE,
      () => this._createActivity(user, dto),
    );
  }

  private async _createActivity(user: JwtUser, dto: CreateActivityDto) {
    const { id: createdById, tenantId } = user;
    const activity = await this.activitiesRepo.create({
      type: dto.type,
      entityType: dto.entityType,
      entityId: dto.entityId,
      subject: dto.subject,
      ...(dto.body !== undefined && { body: dto.body }),
      ...(dto.duration !== undefined && { duration: dto.duration }),
      ...(dto.outcome !== undefined && { outcome: dto.outcome }),
      ...(dto.scheduledAt !== undefined && { scheduledAt: new Date(dto.scheduledAt) }),
      ...(dto.completedAt !== undefined && { completedAt: new Date(dto.completedAt) }),
      createdBy: { connect: { id: createdById } },
      tenant: { connect: { id: tenantId } },
    });

    this.ws.emitToTenant(tenantId, WS_EVENTS.ACTIVITY_LOGGED, { activity });

    // Enqueue embedding generation — non-blocking, processed asynchronously
    // Content = concatenation of all meaningful text fields for best semantic coverage
    const embeddingContent = [
      activity.subject,
      activity.body,
      activity.outcome,
      `Type: ${activity.type}`,
      `Entity: ${activity.entityType}/${activity.entityId}`,
    ]
      .filter(Boolean)
      .join(' | ');

    if (embeddingContent.trim()) {
      // Fire-and-forget — never block the request on Redis availability
      this.embeddingQueue
        .add(
          'embed',
          {
            action: 'upsert' as const,
            tenantId,
            entityType: 'activity',
            entityId: activity.id,
            content: embeddingContent,
            metadata: {
              type: activity.type,
              entityType: activity.entityType,
              entityId: activity.entityId,
              subject: activity.subject,
              createdById,
            },
          },
          embeddingJobOptions('activity', activity.id),
        )
        .catch((err: Error) =>
          this.logger.error(`Failed to enqueue embedding for activity ${activity.id}: ${err.message}`),
        );
    }

    return activity;
  }

  async update(user: JwtUser, id: string, dto: UpdateActivityDto) {
    return this.rbacService.withRBAC(
      user, RbacResource.ACTIVITY, RbacAction.UPDATE,
      async (scope) => {
        const existing = await this.activitiesRepo.findById(id, scope);
        if (!existing) throw new NotFoundError('Activity', id);
        return this._updateActivity(existing, id, dto);
      },
    );
  }

  private async _updateActivity(existing: { tenantId: string }, id: string, dto: UpdateActivityDto) {
    const updated = await this.activitiesRepo.update(id, {
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.entityType !== undefined && { entityType: dto.entityType }),
      ...(dto.entityId !== undefined && { entityId: dto.entityId }),
      ...(dto.subject !== undefined && { subject: dto.subject }),
      ...(dto.body !== undefined && { body: dto.body }),
      ...(dto.duration !== undefined && { duration: dto.duration }),
      ...(dto.outcome !== undefined && { outcome: dto.outcome }),
      ...(dto.scheduledAt !== undefined && { scheduledAt: new Date(dto.scheduledAt) }),
      ...(dto.completedAt !== undefined && { completedAt: new Date(dto.completedAt) }),
    });

    // Re-index if any content-bearing field changed
    const hasContentChange =
      dto.subject !== undefined ||
      dto.body !== undefined ||
      dto.outcome !== undefined ||
      dto.type !== undefined;

    if (hasContentChange) {
      const content = [
        updated.subject,
        updated.body,
        updated.outcome,
        `Type: ${updated.type}`,
        `Entity: ${updated.entityType}/${updated.entityId}`,
      ]
        .filter(Boolean)
        .join(' | ');

      if (content.trim()) {
        this.embeddingQueue
          .add(
            'embed',
            {
              action: 'upsert' as const,
              tenantId: existing.tenantId,
              entityType: 'activity',
              entityId: id,
              content,
              metadata: { type: updated.type, entityType: updated.entityType, entityId: updated.entityId },
            },
            embeddingJobOptions('activity', id),
          )
          .catch((err: Error) =>
            this.logger.error(`Failed to re-index embedding for activity ${id}: ${err.message}`),
          );
      }
    }

    return updated;
  }

  async delete(user: JwtUser, id: string) {
    return this.rbacService.withRBAC(
      user, RbacResource.ACTIVITY, RbacAction.DELETE,
      async (scope) => {
        const existing = await this.activitiesRepo.findById(id, scope);
        if (!existing) throw new NotFoundError('Activity', id);
        return this._deleteActivity(existing, id);
      },
    );
  }

  private async _deleteActivity(existing: { tenantId: string }, id: string) {
    await this.activitiesRepo.delete(id);

    // Purge orphaned embedding — fire-and-forget
    this.embeddingQueue
      .add(
        'delete-embed',
        { action: 'delete' as const, tenantId: existing.tenantId, entityType: 'activity', entityId: id },
        QUEUE_JOB_OPTIONS.aiEmbedding,
      )
      .catch((err: Error) =>
        this.logger.error(`Failed to enqueue embedding delete for activity ${id}: ${err.message}`),
      );

    return { deleted: true };
  }
}
