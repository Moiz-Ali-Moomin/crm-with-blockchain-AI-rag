/**
 * Activities Repository
 *
 * Note: tenantId is NOT passed to Prisma here — it is injected automatically
 * by the PrismaService middleware from AsyncLocalStorage.
 * All queries are automatically tenant-scoped.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '@prisma/client';
import { buildPrismaSkipTake, buildPaginatedResult } from '../../common/dto/pagination.dto';
import { FilterActivityDto, TimelineQueryDto } from './activities.dto';
import { RbacScope } from '../../common/rbac';

@Injectable()
export class ActivitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getTimeline(query: TimelineQueryDto) {
    const { entityType, entityId, page, limit } = query;

    const where: Prisma.ActivityWhereInput = {
      entityType: entityType as any,
      entityId,
    };

    const [data, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...buildPrismaSkipTake(page, limit),
      }),
      this.prisma.activity.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }

  async findAll(filters: FilterActivityDto, scope: RbacScope = {}) {
    const { page, limit, sortBy, sortOrder, search, entityType, entityId, type, createdById, dateFrom, dateTo } = filters;

    const baseWhere: Prisma.ActivityWhereInput = {
      ...(entityType && { entityType: entityType as any }),
      ...(entityId && { entityId }),
      ...(type && { type: type as any }),
      ...(createdById && { createdById }),
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && {
        createdAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          lte: new Date(dateTo),
        },
      }),
      ...(search && {
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
          { outcome: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Merge scope using AND to avoid OR key collisions with the search filter
    const where: Prisma.ActivityWhereInput =
      Object.keys(scope).length > 0 ? { AND: [baseWhere, scope] } : baseWhere;

    const [data, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
        orderBy: { [sortBy ?? 'createdAt']: sortOrder },
        ...buildPrismaSkipTake(page, limit),
      }),
      this.prisma.activity.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }

  async findById(id: string, scope: RbacScope = {}) {
    const where: Prisma.ActivityWhereInput =
      Object.keys(scope).length > 0 ? { AND: [{ id }, scope] } : { id };

    return this.prisma.activity.findFirst({
      where,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
  }

  async create(data: Prisma.ActivityCreateInput) {
    return this.prisma.activity.create({
      data,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async update(id: string, data: Prisma.ActivityUpdateInput) {
    return this.prisma.activity.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async delete(id: string) {
    return this.prisma.activity.delete({ where: { id } });
  }
}
