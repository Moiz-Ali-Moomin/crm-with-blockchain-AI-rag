import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { AiLogRepository } from './repositories/ai-log.repository';
import { AiOperationType } from './types/ai-operation-type.enum'; 
import OpenAI from 'openai';

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly openai: OpenAI;
  private readonly model = 'gpt-4o';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly aiLogRepo?: AiLogRepository, // ✅ optional
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY') ?? '',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC METHODS
  // ─────────────────────────────────────────────────────────────

  async summarizeContactHistory(
    tenantId: string,
    contactId: string,
    contextLimit = 20,
  ): Promise<{ summary: string; keyPoints: string[]; sentiment: string }> {
    const cacheKey = CACHE_KEYS.aiSummary(tenantId, 'contact', contactId);
    const cached = await this.redis.get<any>(cacheKey);

    if (cached) {
      this.logFireAndForget({
        tenantId,
        operationType: AiOperationType.SUMMARIZE_CONTACT,
        entityType: 'contact',
        entityId: contactId,
        prompt: `[cached] contact:${contactId}`,
        response: JSON.stringify(cached),
        metadata: { contextLimit },
      });
      return cached;
    }

    const context = await this.buildContactContext(tenantId, contactId, contextLimit);

    if (!context.hasData) {
      return {
        summary: 'No interaction history found for this contact.',
        keyPoints: [],
        sentiment: 'neutral',
      };
    }

    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a CRM analyst. Return JSON: summary, keyPoints, sentiment.',
        },
        {
          role: 'user',
          content: context.narrative,
        },
      ],
    });

    const raw = completion.choices[0].message.content ?? '{}';
    const result = JSON.parse(raw);

    await this.redis.set(cacheKey, result, CACHE_TTL.AI_SUMMARY);

    this.logFireAndForget({
      tenantId,
      operationType: AiOperationType.SUMMARIZE_CONTACT,
      entityType: 'contact',
      entityId: contactId,
      prompt: context.narrative,
      response: raw,
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // SAFE LOGGING (Mongo optional)
  // ─────────────────────────────────────────────────────────────

  private logFireAndForget(params: {
    tenantId: string;
    operationType: AiOperationType;
    entityType?: string;
    entityId?: string;
    prompt: string;
    response: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
  }): void {
    if (!this.aiLogRepo) return; // ✅ Mongo disabled → skip

    this.aiLogRepo
      .create({
        tenantId: params.tenantId,
        operationType: params.operationType,
        entityType: params.entityType,
        entityId: params.entityId,
        prompt: params.prompt,
        response: params.response,
        latencyMs: params.latencyMs,
        metadata: params.metadata ?? {},
      })
      .catch((err) => {
        this.logger.warn(`AI log failed: ${(err as Error).message}`);
      });
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  private async buildContactContext(
    tenantId: string,
    contactId: string,
    limit: number,
  ): Promise<{ narrative: string; hasData: boolean }> {
    const activities = await this.prisma.activity.findMany({
      where: { tenantId, entityId: contactId },
      take: limit,
    });

    if (!activities.length) {
      return { narrative: '', hasData: false };
    }

    return {
      hasData: true,
      narrative: activities.map((a) => a.subject ?? '').join('\n'),
    };
  }
}