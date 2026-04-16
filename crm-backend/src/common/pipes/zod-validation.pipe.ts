/**
 * Zod Validation Pipe
 *
 * Validates DTOs using Zod schemas attached as metadata.
 * Used as the global validation pipe instead of class-validator.
 *
 * Usage in controllers:
 *   @Body(new ZodValidationPipe(CreateLeadSchema)) body: CreateLeadDto
 */

import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema?: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    // If no schema provided, pass through (used as global pipe)
    if (!this.schema) return value;

    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: this.formatZodErrors(result.error),
      });
    }

    return result.data;
  }

  private formatZodErrors(error: ZodError): Record<string, string[]> {
    const errors: Record<string, string[]> = {};

    error.errors.forEach((err) => {
      const field = err.path.join('.') || 'root';
      if (!errors[field]) errors[field] = [];
      errors[field].push(err.message);
    });

    return errors;
  }
}
