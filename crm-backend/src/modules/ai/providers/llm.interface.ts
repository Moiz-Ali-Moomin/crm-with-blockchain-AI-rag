/**
 * llm.interface.ts — Core LLM provider contract
 *
 * All LLM implementations (Anthropic, OpenAI, …) must implement LLMProvider.
 * Consumers depend on this interface via the LLM_PROVIDER injection token —
 * the concrete class is never visible outside of ai.module.ts and the factory.
 *
 * Design:
 *   - Single `generate()` method keeps the API surface tiny.
 *   - `system` and `context` are optional so the interface stays flexible:
 *     RAG passes both; CopilotService passes only `system`.
 *   - `context` is RAG-retrieved text injected before the user's question.
 */

/** Input shape for a single LLM call */
export interface LLMInput {
  /** Static system instruction (never contains user input) */
  system?: string;
  /** The main user prompt / question */
  prompt: string;
  /** Pre-retrieved context to inject (e.g. RAG results) */
  context?: string;
}

/** Contract every LLM provider must satisfy */
export interface LLMProvider {
  generate(input: LLMInput): Promise<string>;
}

/** NestJS DI injection token */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
