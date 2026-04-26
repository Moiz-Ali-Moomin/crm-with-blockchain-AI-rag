import { Global, Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { RbacPolicyService } from './rbac-policy.service';
import { RbacService } from '../../common/rbac/rbac.service';

/**
 * RbacModule — declared @Global() so RbacService (enforcement) is available
 * in every feature module without adding it to each module's imports array.
 *
 * Provides two distinct services:
 *  - RbacService      — enforcement: withRBAC(), checkPermission(), buildScope()
 *  - RbacPolicyService — introspection API: GET /rbac/roles, GET /rbac/my-permissions
 */
@Global()
@Module({
  controllers: [RbacController],
  providers: [RbacService, RbacPolicyService],
  exports: [RbacService],
})
export class RbacModule {}
