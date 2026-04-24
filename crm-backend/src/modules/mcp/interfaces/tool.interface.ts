import { UserRole } from '@prisma/client';
import { ZodSchema } from 'zod';

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  /** Roles permitted to invoke this tool. Omit to allow all authenticated users. SUPER_ADMIN always bypasses. */
  allowedRoles?: UserRole[];
  /** Zod schema used to validate and sanitize the tool's input before execution. */
  inputSchema?: ZodSchema;
}
