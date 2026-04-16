/**
 * Leads Repository
 *
 * Note: tenantId is NOT passed to Prisma here - it's injected automatically
 * by the PrismaService middleware from AsyncLocalStorage.
 * All queries are automatically tenant-scoped.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '@prisma/client';
import { buildPrismaSkipTake, buildPaginatedResult } from '../../common/dto/pagination.dto';
import { FilterLeadDto } from './leads.dto';

@Injectable()
export class LeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FilterLeadDto) {
    const { page, limit, sortBy, sortOrder, search, status, source, assigneeId, minScore, maxScore, tags, dateFrom, dateTo } = filters;

    const where: Prisma.LeadWhereInput = {
      ...(status && { status }),
      ...(source && { source: source as any }),
      ...(assigneeId && { assigneeId }),
      ...(minScore !== undefined && { score: { gte: minScore } }),
      ...(maxScore !== undefined && { score: { ...((minScore !== undefined) ? { gte: minScore } : {}), lte: maxScore } }),
      ...(tags && { tags: { hasSome: tags.split(',').map((t) => t.trim()) } }),
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && { createdAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), lte: new Date(dateTo) } }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { [sortBy ?? 'createdAt']: sortOrder },
        ...buildPrismaSkipTake(page, limit),
      }),
      this.prisma.lead.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string) {
    return this.prisma.lead.findFirst({
      where: { id },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async create(data: Prisma.LeadCreateInput) {
    return this.prisma.lead.create({
      data,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async update(id: string, data: Prisma.LeadUpdateInput) {
    return this.prisma.lead.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async delete(id: string) {
    return this.prisma.lead.delete({ where: { id } });
  }

  async countByStatus(_tenantId: string) {
    // Analytics query - grouped by status
    return this.prisma.lead.groupBy({
      by: ['status'],
      _count: true,
    });
  }

  async getRecentLeads(limit: number = 5) {
    return this.prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async getKanbanBoard(take = 100) {
    const statuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURING'] as const;

    const results = await Promise.all(
      statuses.map(async (status) => {
        // Fetch one extra to determine whether more pages exist
        const rows = await this.prisma.lead.findMany({
          where: { status },
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: take + 1,
        });

        const hasMore = rows.length > take;
        return [status, { items: rows.slice(0, take), hasMore }] as const;
      }),
    );

    return Object.fromEntries(results) as Record<
      (typeof statuses)[number],
      { items: (typeof results)[0][1]['items']; hasMore: boolean }
    >;
  }
}
