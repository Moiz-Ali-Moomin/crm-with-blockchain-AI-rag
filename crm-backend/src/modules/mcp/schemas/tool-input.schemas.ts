import { z } from 'zod';

export const SearchCrmInputSchema = z.object({
  query: z.string().min(1, 'query must not be empty').max(500, 'query must not exceed 500 characters'),
  entity_types: z
    .array(z.enum(['contact', 'deal', 'lead', 'company', 'task', 'ticket']))
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'limit must be a numeric string')
    .optional(),
});

export const GetDealInputSchema = z.object({
  deal_id: z.string().uuid('deal_id must be a valid UUID'),
  include_activities: z.enum(['true', 'false']).optional(),
});

export const CreateTaskInputSchema = z
  .object({
    title: z.string().min(1, 'title must not be empty').max(200, 'title must not exceed 200 characters'),
    description: z.string().max(2000, 'description must not exceed 2000 characters').optional(),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD')
      .optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    related_entity_type: z.enum(['deal', 'contact', 'lead', 'company']).optional(),
    related_entity_id: z.string().uuid('related_entity_id must be a valid UUID').optional(),
    assigned_to_user_id: z.string().uuid('assigned_to_user_id must be a valid UUID').optional(),
  })
  .refine(
    (data) =>
      !data.related_entity_id || !!data.related_entity_type,
    {
      message: 'related_entity_type is required when related_entity_id is provided',
      path: ['related_entity_type'],
    },
  );

export type SearchCrmInput = z.infer<typeof SearchCrmInputSchema>;
export type GetDealInput = z.infer<typeof GetDealInputSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
