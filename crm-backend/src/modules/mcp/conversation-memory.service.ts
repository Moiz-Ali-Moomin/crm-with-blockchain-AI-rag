import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../core/cache/redis.service';

const SESSION_TTL_SECONDS = 86_400; // 24 hours
const MAX_STORED_TURNS = 10; // user+assistant pairs to keep

export interface MemoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  constructor(private readonly redis: RedisService) {}

  private key(tenantId: string, userId: string, sessionId: string): string {
    return `agent:session:${tenantId}:${userId}:${sessionId}`;
  }

  async load(tenantId: string, userId: string, sessionId: string): Promise<MemoryTurn[]> {
    try {
      const turns = await this.redis.get<MemoryTurn[]>(this.key(tenantId, userId, sessionId));
      return turns ?? [];
    } catch (err) {
      this.logger.warn(`[Memory] Failed to load session ${sessionId}: ${(err as Error).message}`);
      return [];
    }
  }

  async append(
    tenantId: string,
    userId: string,
    sessionId: string,
    userQuery: string,
    assistantAnswer: string,
  ): Promise<void> {
    try {
      const existing = await this.load(tenantId, userId, sessionId);
      const newTurns: MemoryTurn[] = [
        { role: 'user', content: userQuery },
        { role: 'assistant', content: assistantAnswer },
      ];
      const updated: MemoryTurn[] = [...existing, ...newTurns].slice(-(MAX_STORED_TURNS * 2));
      await this.redis.set(this.key(tenantId, userId, sessionId), updated, SESSION_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`[Memory] Failed to save session ${sessionId}: ${(err as Error).message}`);
    }
  }

  async clear(tenantId: string, userId: string, sessionId: string): Promise<void> {
    try {
      await this.redis.del(this.key(tenantId, userId, sessionId));
    } catch (err) {
      this.logger.warn(`[Memory] Failed to clear session ${sessionId}: ${(err as Error).message}`);
    }
  }
}
