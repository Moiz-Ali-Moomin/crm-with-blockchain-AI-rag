import { z } from 'zod';
import { PaginationSchema } from '../../common/dto/pagination.dto';

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  avatar: z.string().url().optional(),
  timezone: z.string().optional(),
});

export const InviteUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  // Role is intentionally excluded — the backend always assigns SALES_REP.
  // Use PATCH /:id/role (SUPER_ADMIN only for ADMIN) to elevate after invite.
  jobTitle: z.string().optional(),
});

// ADMIN is included so SUPER_ADMIN can promote users; the service enforces that
// only SUPER_ADMIN may assign ADMIN — this enum is a structural validation only.
export const UpdateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT_AGENT', 'VIEWER']),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

export const FilterUsersSchema = PaginationSchema.extend({
  role: z
    .enum(['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER', 'SALES_REP', 'SUPPORT_AGENT', 'VIEWER'])
    .optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'INVITED']).optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
export type InviteUserDto = z.infer<typeof InviteUserSchema>;
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type FilterUsersDto = z.infer<typeof FilterUsersSchema>;

