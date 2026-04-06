import { z } from 'zod';
import { PaginationSchema } from '../../common/dto/pagination.dto';

export const CreateLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  companyName: z.string().optional(),
  website: z.string().url().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURING']).default('NEW'),
  source: z.enum([
    'WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA', 'EMAIL_CAMPAIGN',
    'GOOGLE_ADS', 'FACEBOOK_ADS', 'COLD_CALL', 'TRADE_SHOW', 'PARTNER', 'OTHER',
  ]).default('OTHER'),
  score: z.number().int().min(0).max(100).default(0),
  notes: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.unknown()).default({}),
});

export const UpdateLeadSchema = CreateLeadSchema.partial();

const LEAD_SORT_FIELDS = ['createdAt', 'updatedAt', 'firstName', 'lastName', 'score', 'status', 'source'] as const;

export const FilterLeadSchema = PaginationSchema.extend({
  status: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURING', 'CONVERTED', 'LOST']).optional(),
  ),
  source: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  assigneeId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  tags: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  dateFrom: z.preprocess((v) => (v === '' ? undefined : v), z.string().datetime().optional()),
  dateTo: z.preprocess((v) => (v === '' ? undefined : v), z.string().datetime().optional()),
  // Override PaginationSchema.sortBy to restrict to valid Lead columns
  sortBy: z.enum(LEAD_SORT_FIELDS).optional(),
});

export const AssignLeadSchema = z.object({
  assigneeId: z.string().uuid(),
});

export const ConvertLeadSchema = z.object({
  createDeal: z.boolean().default(false),
  dealTitle: z.string().optional(),
  dealValue: z.number().optional(),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
});

export type CreateLeadDto = z.infer<typeof CreateLeadSchema>;
export type UpdateLeadDto = z.infer<typeof UpdateLeadSchema>;
export type FilterLeadDto = z.infer<typeof FilterLeadSchema>;
export type AssignLeadDto = z.infer<typeof AssignLeadSchema>;
export type ConvertLeadDto = z.infer<typeof ConvertLeadSchema>;
