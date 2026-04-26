/**
 * RBAC Controller
 *
 * Exposes role and permission information.
 * All authenticated users can query permissions; role listing is admin-only.
 */

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RbacPolicyService } from './rbac-policy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('rbac')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rbac')
export class RbacController {
  constructor(private readonly service: RbacPolicyService) {}

  @Get('roles')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getRoles() {
    return this.service.getRoles();
  }

  @Get('my-permissions')
  getMyPermissions(@CurrentUser() user: JwtUser) {
    return this.service.getPermissionsForRole(user.role);
  }
}
