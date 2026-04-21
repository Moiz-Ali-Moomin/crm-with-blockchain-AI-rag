/**
 * OpenAILLMProvider — Fallback LLM implementation
 *
 * Used ONLY when the primary (Anthropic) provider fails.
 * Intentionally minimal — this is a safety net, not a primary path.
 *
 * Configuration (via ENV):
 *   OPENAI_API_KEY   — required for this fallback to activate
 *   LLM_MODEL        — optional override (default: gpt-4o)
 */

import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LLMInput, LLMProvider } from './llm.interface';

interface OpenAILLMConfig {
  apiKey: string;
  model?: string;
}

export class OpenAILLMProvider implements LLMProvider {
  private readonly logger = new Logger(OpenAILLMProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: OpenAILLMConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? 'gpt-4o';
  }

  async generate(input: LLMInput): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (input.system) {
      messages.push({ role: 'system', content: input.system });
    }

    const userContent = input.context
      ? `Context:\n${input.context}\n\nQuestion: ${input.prompt}`
      : input.prompt;

    messages.push({ role: 'user', content: userContent });

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      max_tokens: 1024,
      messages,
    });

    const answer = completion.choices[0]?.message?.content ?? '';
    this.logger.debug(`[LLM] OpenAI fallback responded (model=${this.model})`);
    return answer;
  }
}
