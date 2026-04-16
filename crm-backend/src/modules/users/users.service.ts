import { Injectable } from '@nestjs/common';
import {
  NotFoundError,
  ForbiddenError,
  BusinessRuleError,
  ConflictError,
} from '../../shared/errors/domain.errors';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { UsersRepository } from './users.repository';
import { RedisService } from '../../core/cache/redis.service';
import { CACHE_KEYS } from '../../core/cache/cache-keys';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../../core/queue/queue.constants';
import {
  FilterUsersDto,
  UpdateProfileDto,
  InviteUserDto,
  UpdateRoleDto,
  ChangePasswordDto,
} from './users.dto';

// Role hierarchy — higher index = more permissive
const ROLE_HIERARCHY: UserRole[] = [
  UserRole.VIEWER,
  UserRole.SUPPORT_AGENT,
  UserRole.SALES_REP,
  UserRole.SALES_MANAGER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

function roleLevel(role: UserRole): number {
  return ROLE_HIERARCHY.indexOf(role);
}

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly redis: RedisService,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

  async findAll(filters: FilterUsersDto) {
    return this.usersRepo.findAll(filters);
  }

  async findById(id: string) {
    const user = await this.usersRepo.findById(id);
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  async getProfile(userId: string) {
    return this.findById(userId);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.findById(userId);

    const updated = await this.usersRepo.update(userId, {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.jobTitle !== undefined && { jobTitle: dto.jobTitle }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.avatar !== undefined && { avatarUrl: dto.avatar }),
      ...(dto.timezone !== undefined && { timezone: dto.timezone }),
    });

    // Invalidate profile cache
    await this.redis.del(CACHE_KEYS.userProfile(userId));

    return updated;
  }

  async inviteUser(dto: InviteUserDto, tenantId: string) {
    // Check for duplicate email within tenant
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError(`User with email ${dto.email} already exists`);
    }

    // Generate a random temporary password
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await this.usersRepo.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role as UserRole,
      jobTitle: dto.jobTitle,
      passwordHash,
      status: 'INVITED',
      invitedAt: new Date(),
      tenant: { connect: { id: tenantId } },
    });

    // Send invite email via queue
    await this.emailQueue.add(
      'send',
      {
        to: dto.email,
        template: 'user-invite',
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          tempPassword,
          tenantId,
        },
      },
      QUEUE_JOB_OPTIONS.email,
    );

    return user;
  }

  async updateRole(id: string, dto: UpdateRoleDto, actorRole: string) {
    await this.findById(id);
    const targetRole = dto.role as UserRole;
    const actor = actorRole as UserRole;

    // Only ADMIN and SUPER_ADMIN can change roles
    if (actor !== UserRole.ADMIN && actor !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Only admins can update user roles');
    }

    // Actor cannot assign a role higher than or equal to their own (except SUPER_ADMIN)
    if (actor !== UserRole.SUPER_ADMIN && roleLevel(targetRole) >= roleLevel(actor)) {
      throw new ForbiddenError(
        'You cannot assign a role equal to or higher than your own',
      );
    }

    const updated = await this.usersRepo.update(id, { role: targetRole });

    // Invalidate RBAC permissions cache for this user
    await this.redis.del(CACHE_KEYS.userPermissions(id));

    return updated;
  }

  async deactivate(id: string) {
    await this.findById(id);
    const updated = await this.usersRepo.update(id, { status: 'INACTIVE' });
    await this.redis.del(CACHE_KEYS.userProfile(id));
    return updated;
  }

  async activate(id: string) {
    await this.findById(id);
    const updated = await this.usersRepo.update(id, { status: 'ACTIVE' });
    await this.redis.del(CACHE_KEYS.userProfile(id));
    return updated;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersRepo.findByIdWithHash(userId);
    if (!user) throw new NotFoundError('User', userId);

    if (!user.passwordHash) {
      throw new BusinessRuleError('No password set for this account');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BusinessRuleError('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepo.updatePassword(userId, newHash);

    return { message: 'Password updated successfully' };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
