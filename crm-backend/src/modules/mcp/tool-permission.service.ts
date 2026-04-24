import { Injectable, ForbiddenException, UnprocessableEntityException, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ZodSchema, ZodError } from 'zod';
import { Tool } from './interfaces/tool.interface';

@Injectable()
export class ToolPermissionService {
  private readonly logger = new Logger(ToolPermissionService.name);

  checkRole(tool: Tool, userRole: string): void {
    const allowed = tool.allowedRoles;

    if (!allowed || allowed.length === 0) return;

    if (userRole === UserRole.SUPER_ADMIN) return;

    if (!allowed.includes(userRole as UserRole)) {
      this.logger.warn(
        `Role "${userRole}" denied access to tool "${tool.name}". Allowed: [${allowed.join(', ')}]`,
      );
      throw new ForbiddenException(
        `Your role does not have permission to execute tool "${tool.name}"`,
      );
    }
  }

  validateInput(toolName: string, input: Record<string, unknown>, schema: ZodSchema): Record<string, unknown> {
    const result = schema.safeParse(input);

    if (!result.success) {
      const errors = this.formatZodErrors(result.error);
      this.logger.warn(`Tool "${toolName}" input validation failed: ${JSON.stringify(errors)}`);
      throw new UnprocessableEntityException({
        message: `Invalid input for tool "${toolName}"`,
        errors,
      });
    }

    return result.data as Record<string, unknown>;
  }

  private formatZodErrors(error: ZodError): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const issue of error.errors) {
      const field = issue.path.join('.') || 'root';
      (out[field] ??= []).push(issue.message);
    }
    return out;
  }
}
