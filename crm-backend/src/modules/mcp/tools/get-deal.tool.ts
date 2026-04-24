import { UserRole } from '@prisma/client';
import { Tool } from '../interfaces/tool.interface';
import { GetDealInputSchema } from '../schemas/tool-input.schemas';

export const getDealTool: Tool = {
  name: 'get_deal',
  description:
    'Retrieve full details of a CRM deal by its ID, including stage, value, associated contacts, and activity history.',
  parameters: {
    type: 'object',
    properties: {
      deal_id: {
        type: 'string',
        description: 'Unique identifier of the deal (UUID)',
      },
      include_activities: {
        type: 'string',
        description: 'Whether to include recent activities. Defaults to false.',
        enum: ['true', 'false'],
      },
    },
    required: ['deal_id'],
  },
  allowedRoles: [
    UserRole.VIEWER,
    UserRole.SUPPORT_AGENT,
    UserRole.SALES_REP,
    UserRole.SALES_MANAGER,
    UserRole.ADMIN,
  ],
  inputSchema: GetDealInputSchema,
};
