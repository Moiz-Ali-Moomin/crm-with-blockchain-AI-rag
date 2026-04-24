import { UserRole } from '@prisma/client';
import { Tool } from '../interfaces/tool.interface';
import { SearchCrmInputSchema } from '../schemas/tool-input.schemas';

export const searchCrmTool: Tool = {
  name: 'search_crm',
  description:
    'Search across CRM entities (contacts, deals, leads, companies) using a free-text query. Returns ranked results with entity type and ID.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Free-text search query',
      },
      entity_types: {
        type: 'array',
        description: 'Limit search to specific entity types. Omit to search all.',
        items: {
          type: 'string',
          enum: ['contact', 'deal', 'lead', 'company', 'task', 'ticket'],
        },
      },
      limit: {
        type: 'string',
        description: 'Maximum number of results to return (1–50). Defaults to 10.',
      },
    },
    required: ['query'],
  },
  allowedRoles: [
    UserRole.VIEWER,
    UserRole.SUPPORT_AGENT,
    UserRole.SALES_REP,
    UserRole.SALES_MANAGER,
    UserRole.ADMIN,
  ],
  inputSchema: SearchCrmInputSchema,
};
