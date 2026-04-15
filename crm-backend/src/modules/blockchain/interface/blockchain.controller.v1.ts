/**
 * BlockchainController (v1)
 *
 * Thin HTTP interface for blockchain verification endpoints.
 * Delegates to use-cases — no direct repository access.
 *
 * Previous issue: BlockchainController was injecting BlockchainRepository directly.
 * This is fixed: controller → use-case → port → repository.
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { VerifyDealSchema, VerifyDealDto } from '../blockchain.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import {
  VerifyDealUseCase,
  GetBlockchainRecordUseCase,
} from '../application/use-cases/verify-deal.use-case';

@ApiTags('Blockchain')
@ApiBearerAuth()
@Controller('blockchain')
@UseGuards(RolesGuard)
@Roles(UserRole.SALES_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class BlockchainControllerV1 {
  constructor(
    private readonly verifyDeal: VerifyDealUseCase,
    private readonly getBlockchainRecord: GetBlockchainRecordUseCase,
  ) {}

  /**
   * GET /api/v1/blockchain/verify?dealId=xxx
   * Cross-checks the DB hash for the deal against what is stored on-chain.
   */
  @Get('verify')
  @ApiOperation({ summary: 'Verify a deal hash on-chain (DB + chain cross-check)' })
  verify(
    @CurrentUser() user: { tenantId: string },
    @Query(new ZodValidationPipe(VerifyDealSchema)) dto: VerifyDealDto,
  ) {
    return this.verifyDeal.execute(user.tenantId, dto.dealId);
  }

  /**
   * GET /api/v1/blockchain/record?dealId=xxx
   * Returns the DB-side blockchain registration status (PENDING / CONFIRMED / FAILED).
   */
  @Get('record')
  @ApiOperation({ summary: 'Get blockchain registration status for a deal' })
  getRecord(
    @CurrentUser() user: { tenantId: string },
    @Query(new ZodValidationPipe(VerifyDealSchema)) dto: VerifyDealDto,
  ) {
    return this.getBlockchainRecord.execute(user.tenantId, dto.dealId);
  }
}
