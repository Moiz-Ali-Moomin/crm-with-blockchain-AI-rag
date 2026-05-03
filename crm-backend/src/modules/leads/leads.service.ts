/**
 * Leads Service
 * Business logic for lead management.
 * Emits automation events after state changes so the automation engine
 * can process them asynchronously.
 */

import { Injectable } from '@nestjs/common';
import { NotFoundError, BusinessRuleError } from '../../shared/errors/domain.errors';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LeadsRepository } from './leads.repository';
import { ContactsRepository } from '../contacts/contacts.repository';
import { PrismaTransactionService } from '../../core/database/prisma-transaction.service';
import { WsService, WS_EVENTS } from '../../core/websocket/ws.service';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../core/queue/queue.constants';
import { LeadScoringService } from '../analytics/lead-scoring.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  FilterLeadDto,
  AssignLeadDto,
  ConvertLeadDto,
} from './leads.dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly leadsRepo: LeadsRepository,
    private readonly contactsRepo: ContactsRepository,
    private readonly tx: PrismaTransactionService,
    private readonly ws: WsService,
    private readonly leadScoring: LeadScoringService,
    @InjectQueue(QUEUE_NAMES.AUTOMATION) private readonly automationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOK_OUTBOUND) private readonly webhookQueue: Queue,
  ) {}

  async findAll(filters: FilterLeadDto) {
    return this.leadsRepo.findAll(filters);
  }

  async findById(id: string) {
    const lead = await this.leadsRepo.findById(id);
    if (!lead) throw new NotFoundError('Lead', id);
    return lead;
  }

  async create(dto: CreateLeadDto, createdById: string, tenantId: string) {
    const { assigneeId, customFields, ...leadData } = dto;
    const lead = await this.leadsRepo.create({
      ...leadData,
      customFields: customFields as any,
      createdBy: { connect: { id: createdById } },
      tenant: { connect: { id: tenantId } },
      ...(assigneeId && { assignee: { connect: { id: assigneeId } } }),
    } as any);

    // Trigger automation engine asynchronously
    await Promise.all([
      this.automationQueue.add(
        'evaluate',
        {
          tenantId,
          event: 'LEAD_CREATED',
          entityType: 'LEAD',
          entityId: lead.id,
          data: lead,
        },
        QUEUE_JOB_OPTIONS.automation,
      ),

      // Outbound webhook delivery
      this.webhookQueue.add(
        'deliver',
        { tenantId, event: 'LEAD_CREATED', payload: lead },
        QUEUE_JOB_OPTIONS.webhook,
      ),
    ]);

    // Realtime notification to tenant
    this.ws.emitToTenant(tenantId, WS_EVENTS.LEAD_CREATED, { lead });

    // Compute initial lead score asynchronously — fire and forget
    // Score will be cached and written back to lead.score column
    this.leadScoring.recomputeScore(tenantId, lead.id).catch(() => {
      // Scoring failure must never propagate to the create response
    });

    // Notify assigned user
    if (lead.assigneeId) {
      await this.notificationQueue.add('create', {
        tenantId,
        userId: lead.assigneeId,
        title: 'New lead assigned',
        body: `${lead.firstName} ${lead.lastName} has been assigned to you`,
        type: 'lead_assigned',
        entityType: 'LEAD',
        entityId: lead.id,
      });
    }

    return lead;
  }

  async update(id: string, dto: UpdateLeadDto) {
    const existing = await this.findById(id); // 404 check — also captures tenantId

    const lead = await this.leadsRepo.update(id, dto as any);

    // Trigger automation if status changed
    if (dto.status) {
      await this.automationQueue.add(
        'evaluate',
        {
          tenantId: existing.tenantId, // was missing — automations silently failed
          event: 'LEAD_STATUS_CHANGED',
          entityType: 'LEAD',
          entityId: id,
          data: { lead, newStatus: dto.status },
        },
        QUEUE_JOB_OPTIONS.automation,
      );
    }

    // Re-score: status, lastContactedAt, and other fields affect the score
    this.leadScoring.recomputeScore(existing.tenantId, id).catch(() => {});

    return lead;
  }

  async getKanbanBoard() {
    return this.leadsRepo.getKanbanBoard(100);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.leadsRepo.delete(id);
    return { deleted: true };
  }

  async assign(id: string, dto: AssignLeadDto, actorTenantId: string) {
    const lead = await this.findById(id);

    const updated = await this.leadsRepo.update(id, {
      assignee: { connect: { id: dto.assigneeId } },
      status: lead.status === 'NEW' ? 'CONTACTED' : lead.status,
    });

    // Notify the assignee
    await this.notificationQueue.add('create', {
      tenantId: actorTenantId,
      userId: dto.assigneeId,
      title: 'Lead assigned to you',
      body: `${lead.firstName} ${lead.lastName} has been assigned to you`,
      type: 'lead_assigned',
      entityType: 'LEAD',
      entityId: id,
    });

    this.ws.emitToUser(dto.assigneeId, WS_EVENTS.LEAD_ASSIGNED, { lead: updated });

    return updated;
  }

  async convert(id: string, dto: ConvertLeadDto, createdById: string, tenantId: string) {
    const lead = await this.findById(id);

    if (lead.status === 'CONVERTED') {
      throw new BusinessRuleError('Lead has already been converted');
    }

    const result = await this.tx.run(async (tx) => {
      // Create contact from lead data
      const contact = await tx.contact.create({
        data: {
          tenantId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email ?? undefined,
          phone: lead.phone ?? undefined,
          jobTitle: lead.jobTitle ?? undefined,
          fromLeadId: lead.id,
        },
      });

      // Mark lead as converted
      const updatedLead = await tx.lead.update({
        where: { id },
        data: {
          status: 'CONVERTED',
          convertedAt: new Date(),
          convertedToId: contact.id,
        },
      });

      let deal: any = null;

      if (dto.createDeal && dto.pipelineId && dto.stageId) {
        deal = await tx.deal.create({
          data: {
            tenantId,
            title: dto.dealTitle ?? `Deal - ${contact.firstName} ${contact.lastName}`,
            value: dto.dealValue ?? 0,
            pipelineId: dto.pipelineId,
            stageId: dto.stageId,
            contactId: contact.id,
            ...(lead.companyName && { description: `From lead: ${lead.companyName}` }),
          },
        });
      }

      return { contact, lead: updatedLead, deal };
    });

    return result;
  }
}
