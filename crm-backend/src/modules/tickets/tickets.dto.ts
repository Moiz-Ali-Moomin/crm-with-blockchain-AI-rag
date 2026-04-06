import { z } from 'zod';
import { PaginationSchema } from '../../common/dto/pagination.dto';

export const CreateTicketSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().min(1),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED']).default('OPEN'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  contactId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

export const UpdateTicketSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  contactId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

export const AssignTicketSchema = z.object({
  assigneeId: z.string().uuid(),
});

export const FilterTicketSchema = PaginationSchema.extend({
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED']).optional()),
  priority: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional()),
  assigneeId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  contactId: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
});

export const CreateTicketReplySchema = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().default(false),
});

export const UpdateTicketReplySchema = z.object({
  body: z.string().min(1),
});

export type CreateTicketDto = z.infer<typeof CreateTicketSchema>;
export type UpdateTicketDto = z.infer<typeof UpdateTicketSchema>;
export type AssignTicketDto = z.infer<typeof AssignTicketSchema>;
export type FilterTicketDto = z.infer<typeof FilterTicketSchema>;
export type CreateTicketReplyDto = z.infer<typeof CreateTicketReplySchema>;
export type UpdateTicketReplyDto = z.infer<typeof UpdateTicketReplySchema>;
