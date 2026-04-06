import { z } from 'zod';
import { PaginationSchema } from '../../common/dto/pagination.dto';

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
  reminderAt: z.string().datetime().optional(),
  entityType: z
    .enum(['LEAD', 'CONTACT', 'DEAL', 'COMPANY', 'TICKET'])
    .optional(),
  entityId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

export const UpdateTaskSchema = CreateTaskSchema.partial();

export const FilterTaskSchema = PaginationSchema.extend({
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional()),
  priority: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()),
  assigneeId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  entityType: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['LEAD', 'CONTACT', 'DEAL', 'COMPANY', 'TICKET']).optional(),
  ),
  entityId: z.string().uuid().optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
});

export const MyTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;
export type FilterTaskDto = z.infer<typeof FilterTaskSchema>;
export type MyTasksQueryDto = z.infer<typeof MyTasksQuerySchema>;
