/**
 * PromptSanitizer
 * 
 * Protects against prompt injection attacks by:
 * 1. Filtering out common injection keywords and patterns
 * 2. Enforcing strict length limits on user-provided text
 * 3. Normalizing whitespace to prevent hidden instructions
 */
export class PromptSanitizer {
  private static readonly MAX_USER_INPUT_LENGTH = 2000;

  private static readonly INJECTION_PATTERNS = [
    /ignore previous instructions/gi,
    /system prompt/gi,
    /you are now/gi,
    /bypass/gi,
    /override/gi,
    /disregard/gi,
    /forget everything/gi,
    /do not answer/gi,
    /instead of/gi,
    /from now on/gi,
    /as a different/gi,
    /jailbreak/gi,
  ];

  /**
   * Sanitize a user-provided prompt string.
   * Returns a cleaned version of the string.
   */
  static sanitize(input: string): string {
    if (!input) return '';

    // 1. Cap length to prevent resource exhaustion and long-form injection
    let cleaned = input.slice(0, this.MAX_USER_INPUT_LENGTH);

    // 2. Normalize whitespace (removes large gaps used to hide instructions)
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // 3. Check for injection patterns and redact them if found
    for (const pattern of this.INJECTION_PATTERNS) {
      cleaned = cleaned.replace(pattern, '[REDACTED]');
    }

    return cleaned;
  }

  /**
   * Validates if a prompt is potentially dangerous.
   * Useful for rejecting requests before they even hit the sanitizer.
   */
  static isPotentiallyDangerous(input: string): boolean {
    if (!input) return false;
    
    // Check if input is excessively long (before slicing)
    if (input.length > this.MAX_USER_INPUT_LENGTH * 1.5) {
      return true;
    }

    // Check for patterns
    return this.INJECTION_PATTERNS.some(pattern => pattern.test(input));
  }
}
