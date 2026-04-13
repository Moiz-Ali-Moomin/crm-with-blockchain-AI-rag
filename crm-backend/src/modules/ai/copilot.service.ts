/**
 * CopilotService
 *
 * LLM-powered features using GPT-4o:
 *  - summarizeContactHistory()  → digest of all customer interactions
 *  - generateEmailReply()        → AI-drafted reply to an inbound email
 *  - suggestFollowUp()           → recommended next action for a CRM entity
 *  - summarizeActivityTimeline() → compact narrative of entity activities
 *
 * Design rules:
 * - Every public method FIRST fetches context from the DB (no hallucination)
 * - Responses are cached (summary = 10min, reply = NOT cached as it's per-intent)
 * - Temperature is low (0.3) for factual tasks, higher (0.7) for creative ones
 * - System prompts are deterministic — no user-controlled prompt injection
 * - Every LLM call is logged to MongoDB via AiLogRepository (fire-and-forget)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS, CACHE_TTL } from '../../core/cache/cache-keys';
import { AiLogRepository } from './repositories/ai-log.repository';
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
    private readonly aiLogRepo: AiLogRepository,
  ) {
    // config.get() — not getOrThrow(). AiModule only provides CopilotService
    // when ENABLE_AI=true and OPENAI_API_KEY is confirmed present at module
    // factory time. Using getOrThrow here is redundant and crashes CI.
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY') ?? '',
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns a structured narrative of all interactions with a contact:
   * emails, calls, meetings, tickets — last N records.
   */
  async summarizeContactHistory(
    tenantId: string,
    contactId: string,
    contextLimit = 20,
  ): Promise<{ summary: string; keyPoints: string[]; sentiment: string }> {
    const cacheKey = CACHE_KEYS.aiSummary(tenantId, 'contact', contactId);
    const cached = await this.redis.get<{ summary: string; keyPoints: string[]; sentiment: string }>(cacheKey);
    if (cached) {
      // Log cache hit — no tokens used
      this.logFireAndForget({
        tenantId,
        operationType: 'summarize_contact',
        entityType: 'contact',
        entityId: contactId,
        prompt: `[cached] contact:${contactId}`,
        response: JSON.stringify(cached),
        servedFromCache: true,
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

    const userMessage = `Contact: ${context.contactName}\n\nInteraction History:\n${context.narrative}`;
    const systemMessage = `You are a CRM analyst assistant. Given a customer's interaction history,
produce a concise, factual summary. Return JSON with:
{ "summary": string (2–4 sentences), "keyPoints": string[] (max 5 bullet facts), "sentiment": "positive"|"neutral"|"negative" }
Never invent facts not present in the provided data.`;

    const startMs = Date.now();
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
    });
    const latencyMs = Date.now() - startMs;

    const raw = completion.choices[0].message.content ?? '{}';
    const result = JSON.parse(raw) as {
      summary: string;
      keyPoints: string[];
      sentiment: string;
    };

    await this.redis.set(cacheKey, result, CACHE_TTL.AI_SUMMARY);

    this.logFireAndForget({
      tenantId,
      operationType: 'summarize_contact',
      entityType: 'contact',
      entityId: contactId,
      prompt: userMessage,
      response: raw,
      latencyMs,
      promptTokens:     completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens:      completion.usage?.total_tokens,
      metadata: { model: this.model, temperature: 0.2, contextLimit },
    });

    return result;
  }

  /**
   * Generates an email reply draft based on the original email body and context.
   * NOT cached — each call is a fresh intent.
   */
  async generateEmailReply(
    tenantId: string,
    communicationId: string,
    instruction?: string,
  ): Promise<{ subject: string; body: string; tone: string }> {
    const comm = await this.prisma.withoutTenantScope(() =>
      this.prisma.communication.findFirst({
        where: { id: communicationId, tenantId },
        include: {
          contact: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
    );

    if (!comm) {
      throw new Error(`Communication ${communicationId} not found`);
    }

    const contactName = comm.contact
      ? `${comm.contact.firstName} ${comm.contact.lastName}`
      : 'the customer';

    const userInstruction = instruction
      ? `\n\nAdditional instruction: ${instruction}`
      : '';

    const userMessage = `Original email from ${contactName}:
Subject: ${comm.subject ?? '(no subject)'}

${comm.body}
${userInstruction}

Write a reply.`;

    const systemMessage = `You are a professional sales/support email writer for a CRM system.
Write a helpful, professional reply. Return JSON:
{ "subject": string, "body": string (plain text, sign off as "The Team"), "tone": "formal"|"friendly"|"empathetic" }`;

    const startMs = Date.now();
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
    });
    const latencyMs = Date.now() - startMs;

    const raw = completion.choices[0].message.content ?? '{}';
    const result = JSON.parse(raw) as { subject: string; body: string; tone: string };

    this.logFireAndForget({
      tenantId,
      operationType: 'generate_email_reply',
      entityType: 'communication',
      entityId: communicationId,
      prompt: userMessage,
      response: raw,
      latencyMs,
      promptTokens:     completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens:      completion.usage?.total_tokens,
      metadata: {
        model: this.model,
        temperature: 0.5,
        communicationId,
        hasInstruction: !!instruction,
      },
    });

    return result;
  }

  /**
   * Suggests the best next action for a CRM entity (lead, contact, or deal).
   * Looks at recent activities + deal stage / lead status to produce a recommendation.
   */
  async suggestFollowUp(
    tenantId: string,
    entityType: 'lead' | 'contact' | 'deal',
    entityId: string,
  ): Promise<{
    action: string;
    reasoning: string;
    urgency: 'low' | 'medium' | 'high';
    suggestedChannel: string;
  }> {
    const contextStr = await this.buildEntityContext(tenantId, entityType, entityId);

    const systemMessage = `You are a sales strategy assistant for a CRM. Suggest the single best next follow-up action.
Return JSON:
{ "action": string (imperative, max 20 words), "reasoning": string (1–2 sentences), "urgency": "low"|"medium"|"high", "suggestedChannel": "email"|"phone"|"meeting"|"sms"|"no_action" }`;

    const startMs = Date.now();
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: contextStr },
      ],
    });
    const latencyMs = Date.now() - startMs;

    const raw = completion.choices[0].message.content ?? '{}';
    const result = JSON.parse(raw) as {
      action: string;
      reasoning: string;
      urgency: 'low' | 'medium' | 'high';
      suggestedChannel: string;
    };

    this.logFireAndForget({
      tenantId,
      operationType: 'suggest_follow_up',
      entityType,
      entityId,
      prompt: contextStr,
      response: raw,
      latencyMs,
      promptTokens:     completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens:      completion.usage?.total_tokens,
      metadata: { model: this.model, temperature: 0.3 },
    });

    return result;
  }

  /**
   * Compact narrative summary of an entity's activity timeline.
   * Used in detail pages (deal, contact, lead) to give agents quick context.
   */
  async summarizeActivityTimeline(
    tenantId: string,
    entityType: string,
    entityId: string,
    contextLimit = 15,
  ): Promise<{ summary: string; lastActivity: string; nextStep: string }> {
    const cacheKey = CACHE_KEYS.aiSummary(tenantId, entityType, entityId);
    const cached = await this.redis.get<{ summary: string; lastActivity: string; nextStep: string }>(cacheKey);
    if (cached) {
      this.logFireAndForget({
        tenantId,
        operationType: 'summarize_activity',
        entityType,
        entityId,
        prompt: `[cached] ${entityType}:${entityId}`,
        response: JSON.stringify(cached),
        servedFromCache: true,
        metadata: { contextLimit },
      });
      return cached;
    }

    const activities = await this.prisma.withoutTenantScope(() =>
      this.prisma.activity.findMany({
        where: {
          tenantId,
          entityType: entityType.toUpperCase() as any,
          entityId,
        },
        orderBy: { createdAt: 'desc' },
        take: contextLimit,
        select: {
          type: true,
          subject: true,
          body: true,
          outcome: true,
          createdAt: true,
        },
      }),
    );

    if (!activities.length) {
      return {
        summary: 'No activities logged yet.',
        lastActivity: 'None',
        nextStep: 'Log the first activity to start tracking engagement.',
      };
    }

    const narrative = activities
      .map(
        (a) =>
          `[${a.type}] ${a.subject ?? ''} — ${a.body ?? ''} — Outcome: ${a.outcome ?? 'N/A'} (${new Date(a.createdAt).toLocaleDateString()})`,
      )
      .join('\n');

    const userMessage = `Activities for ${entityType} ${entityId}:\n${narrative}`;
    const systemMessage = `You are a CRM analyst. Summarise the activity timeline concisely.
Return JSON: { "summary": string (2–3 sentences), "lastActivity": string (1 sentence), "nextStep": string (actionable, 1 sentence) }`;

    const startMs = Date.now();
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
    });
    const latencyMs = Date.now() - startMs;

    const raw = completion.choices[0].message.content ?? '{}';
    const result = JSON.parse(raw) as {
      summary: string;
      lastActivity: string;
      nextStep: string;
    };

    await this.redis.set(cacheKey, result, CACHE_TTL.AI_SUMMARY);

    this.logFireAndForget({
      tenantId,
      operationType: 'summarize_activity',
      entityType,
      entityId,
      prompt: userMessage,
      response: raw,
      latencyMs,
      promptTokens:     completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens:      completion.usage?.total_tokens,
      metadata: { model: this.model, temperature: 0.2, contextLimit, activitiesCount: activities.length },
    });

    return result;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Fire-and-forget wrapper for AI log writes.
   *
   * Rules:
   * 1. NEVER awaited — must not add latency to the response path
   * 2. NEVER throws — AiLogRepository.create() already swallows its own errors,
   *    but we add a .catch() here as an extra safety net
   * 3. Logs a warning if the write fails — silent failure is not acceptable
   */
  private logFireAndForget(params: {
    tenantId: string;
    operationType: Parameters<AiLogRepository['create']>[0]['operationType'];
    entityType?: string;
    entityId?: string;
    prompt: string;
    response: string;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    servedFromCache?: boolean;
    metadata?: Record<string, unknown>;
  }): void {
    this.aiLogRepo
      .create({
        tenantId:         params.tenantId,
        operationType:    params.operationType,
        entityType:       params.entityType,
        entityId:         params.entityId,
        prompt:           params.prompt,
        response:         params.response,
        latencyMs:        params.latencyMs,
        promptTokens:     params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens:      params.totalTokens,
        servedFromCache:  params.servedFromCache ?? false,
        metadata:         params.metadata ?? {},
      })
      .catch((err) => {
        // AiLogRepository.create() already handles errors internally,
        // but this is a belt-and-suspenders guard for unexpected Promise rejections
        this.logger.warn(`AI log fire-and-forget failed: ${(err as Error).message}`);
      });
  }

  // ─── Private Context Builders ────────────────────────────────────────────────

  private async buildContactContext(
    tenantId: string,
    contactId: string,
    limit: number,
  ): Promise<{ contactName: string; narrative: string; hasData: boolean }> {
    const [contact, activities, comms, tickets] = await Promise.all([
      this.prisma.withoutTenantScope(() =>
        this.prisma.contact.findFirst({
          where: { id: contactId, tenantId },
          select: { firstName: true, lastName: true, email: true, jobTitle: true },
        }),
      ),
      this.prisma.withoutTenantScope(() =>
        this.prisma.activity.findMany({
          where: { tenantId, entityType: 'CONTACT', entityId: contactId },
          orderBy: { createdAt: 'desc' },
          take: Math.floor(limit / 2),
          select: { type: true, subject: true, body: true, outcome: true, createdAt: true },
        }),
      ),
      this.prisma.withoutTenantScope(() =>
        this.prisma.communication.findMany({
          where: { tenantId, contactId },
          orderBy: { createdAt: 'desc' },
          take: Math.floor(limit / 2),
          select: { channel: true, direction: true, subject: true, body: true, status: true, createdAt: true },
        }),
      ),
      this.prisma.withoutTenantScope(() =>
        this.prisma.ticket.findMany({
          where: { tenantId, contactId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { subject: true, status: true, priority: true, createdAt: true },
        }),
      ),
    ]);

    if (!contact) {
      return { contactName: 'Unknown', narrative: '', hasData: false };
    }

    const hasData = activities.length > 0 || comms.length > 0 || tickets.length > 0;
    const contactName = `${contact.firstName} ${contact.lastName}`;

    const lines: string[] = [];

    for (const a of activities) {
      lines.push(
        `ACTIVITY [${a.type}] "${a.subject ?? ''}" — ${a.body?.slice(0, 200) ?? ''} | Outcome: ${a.outcome ?? 'N/A'} (${new Date(a.createdAt).toLocaleDateString()})`,
      );
    }
    for (const c of comms) {
      lines.push(
        `COMM [${c.channel}/${c.direction}] Subject: "${c.subject ?? ''}" — ${c.body?.slice(0, 200) ?? ''} | Status: ${c.status} (${new Date(c.createdAt).toLocaleDateString()})`,
      );
    }
    for (const t of tickets) {
      lines.push(
        `TICKET "${t.subject}" | ${t.status} / ${t.priority} (${new Date(t.createdAt).toLocaleDateString()})`,
      );
    }

    return { contactName, narrative: lines.join('\n'), hasData };
  }

  private async buildEntityContext(
    tenantId: string,
    entityType: 'lead' | 'contact' | 'deal',
    entityId: string,
  ): Promise<string> {
    const lines: string[] = [`Entity: ${entityType.toUpperCase()} (${entityId})`];

    if (entityType === 'lead') {
      const lead = await this.prisma.withoutTenantScope(() =>
        this.prisma.lead.findFirst({
          where: { id: entityId, tenantId },
          select: {
            firstName: true,
            lastName: true,
            status: true,
            source: true,
            score: true,
            lastContactedAt: true,
            notes: true,
          },
        }),
      );
      if (lead) {
        lines.push(
          `Name: ${lead.firstName} ${lead.lastName}`,
          `Status: ${lead.status} | Score: ${lead.score} | Source: ${lead.source}`,
          `Last contacted: ${lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleDateString() : 'Never'}`,
          `Notes: ${lead.notes ?? 'None'}`,
        );
      }
    } else if (entityType === 'deal') {
      const deal = await this.prisma.withoutTenantScope(() =>
        this.prisma.deal.findFirst({
          where: { id: entityId, tenantId },
          include: { stage: { select: { name: true, probability: true } } },
        }),
      );
      if (deal) {
        lines.push(
          `Title: ${deal.title}`,
          `Value: ${deal.currency} ${deal.value} | Status: ${deal.status}`,
          `Stage: ${deal.stage.name} (${Math.round(deal.stage.probability * 100)}% probability)`,
          `Closing date: ${deal.closingDate ? new Date(deal.closingDate).toLocaleDateString() : 'Not set'}`,
        );
      }
    }

    // Attach last 5 activities regardless of entity type
    const recentActivities = await this.prisma.withoutTenantScope(() =>
      this.prisma.activity.findMany({
        where: { tenantId, entityType: entityType.toUpperCase() as any, entityId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { type: true, subject: true, outcome: true, createdAt: true },
      }),
    );

    if (recentActivities.length) {
      lines.push('\nRecent activities:');
      for (const a of recentActivities) {
        lines.push(
          `  • [${a.type}] ${a.subject ?? ''} — ${a.outcome ?? 'No outcome'} (${new Date(a.createdAt).toLocaleDateString()})`,
        );
      }
    } else {
      lines.push('\nNo activities logged.');
    }

    return lines.join('\n');
  }
}
