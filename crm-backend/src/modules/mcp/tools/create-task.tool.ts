import { UserRole } from '@prisma/client';
import { Tool } from '../interfaces/tool.interface';
import { CreateTaskInputSchema } from '../schemas/tool-input.schemas';

export const createTaskTool: Tool = {
  name: 'create_task',
  description:
    'Create a new task in the CRM and optionally link it to a deal, contact, or lead. Returns the created task ID.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short title of the task',
      },
      description: {
        type: 'string',
        description: 'Optional longer description or notes',
      },
      due_date: {
        type: 'string',
        description: 'ISO 8601 date string for when the task is due (e.g. 2026-05-01)',
      },
      priority: {
        type: 'string',
        description: 'Task priority level. Defaults to medium.',
        enum: ['low', 'medium', 'high', 'urgent'],
      },
      related_entity_type: {
        type: 'string',
        description: 'Type of CRM entity to link this task to',
        enum: ['deal', 'contact', 'lead', 'company'],
      },
      related_entity_id: {
        type: 'string',
        description: 'UUID of the related entity (required when related_entity_type is set)',
      },
      assigned_to_user_id: {
        type: 'string',
        description: 'UUID of the user to assign this task to',
      },
    },
    required: ['title'],
  },
  allowedRoles: [
    UserRole.SUPPORT_AGENT,
    UserRole.SALES_REP,
    UserRole.SALES_MANAGER,
    UserRole.ADMIN,
  ],
  inputSchema: CreateTaskInputSchema,
};
