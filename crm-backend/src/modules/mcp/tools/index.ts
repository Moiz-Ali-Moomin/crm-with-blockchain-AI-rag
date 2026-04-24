import { Tool } from '../interfaces/tool.interface';
import { searchCrmTool } from './search-crm.tool';
import { getDealTool } from './get-deal.tool';
import { createTaskTool } from './create-task.tool';

export const CRM_TOOLS: Tool[] = [
  searchCrmTool,
  getDealTool,
  createTaskTool,
];
