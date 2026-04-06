import { z } from 'zod';
import { PaginationSchema } from '../../common/dto/pagination.dto';

export const CreateDealSchema = z.object({
  title: z.string().min(1).max(255),
  value: z.number().nonnegative().default(0),
  currency: z.string().length(3).default('USD'),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  closingDate: z.string().datetime().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.unknown()).default({}),
});

export const UpdateDealSchema = CreateDealSchema.omit({ pipelineId: true, stageId: true }).partial();

export const MoveDealStageSchema = z.object({
  stageId: z.string().uuid(),
  lostReason: z.string().optional(),
});

export const FilterDealSchema = PaginationSchema.extend({
  pipelineId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  stageId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['OPEN', 'WON', 'LOST', 'ON_HOLD']).optional()),
  ownerId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  contactId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  closingDateFrom: z.string().datetime().optional(),
  closingDateTo: z.string().datetime().optional(),
});

export type CreateDealDto = z.infer<typeof CreateDealSchema>;
export type UpdateDealDto = z.infer<typeof UpdateDealSchema>;
export type MoveDealStageDto = z.infer<typeof MoveDealStageSchema>;
export type FilterDealDto = z.infer<typeof FilterDealSchema>;
