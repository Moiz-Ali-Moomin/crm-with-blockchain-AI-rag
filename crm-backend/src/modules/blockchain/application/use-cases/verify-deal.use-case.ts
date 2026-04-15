/**
 * VerifyDealUseCase
 *
 * Verifies a deal's on-chain hash proof.
 *
 * Flow:
 *   1. Load blockchain record from DB (via port)
 *   2. If not CONFIRMED → return not-verified result
 *   3. If CONFIRMED → cross-check DB hash against on-chain registry
 *   4. Return structured verification result
 *
 * This use-case replaces the direct controller → service → repo call
 * that existed in the original BlockchainController.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BLOCKCHAIN_RECORD_REPOSITORY_PORT,
  BlockchainRecordRepositoryPort,
} from '../ports/blockchain-record.repository.port';
import { BlockchainService } from '../../blockchain.service';

export interface VerificationResult {
  isValid: boolean;
  storedHash: string;
  registeredAt: Date | null;
  blockNumber: number | null;
  txHash: string | null;
  network: string;
  status: string;
}

@Injectable()
export class VerifyDealUseCase {
  private readonly logger = new Logger(VerifyDealUseCase.name);

  constructor(
    @Inject(BLOCKCHAIN_RECORD_REPOSITORY_PORT)
    private readonly blockchainRecordRepo: BlockchainRecordRepositoryPort,
    private readonly blockchainService: BlockchainService,
  ) {}

  async execute(tenantId: string, dealId: string): Promise<VerificationResult> {
    this.logger.log(`Verifying deal ${dealId} on-chain for tenant ${tenantId}`);

    // Delegate to the existing BlockchainService which handles both:
    //   - fast-path: DB record not CONFIRMED → return early
    //   - full-path: cross-check against chain via ethers.js read-only provider
    return this.blockchainService.verifyDealOnChain(tenantId, dealId) as Promise<VerificationResult>;
  }
}

/**
 * GetBlockchainRecordUseCase
 *
 * Returns the raw DB-side blockchain record for a deal.
 * Used for status polling in the UI (PENDING / CONFIRMED / FAILED).
 */
@Injectable()
export class GetBlockchainRecordUseCase {
  private readonly logger = new Logger(GetBlockchainRecordUseCase.name);

  constructor(
    @Inject(BLOCKCHAIN_RECORD_REPOSITORY_PORT)
    private readonly blockchainRecordRepo: BlockchainRecordRepositoryPort,
  ) {}

  async execute(tenantId: string, dealId: string) {
    this.logger.log(`Fetching blockchain record for deal ${dealId}`);
    return this.blockchainRecordRepo.findByDeal(tenantId, dealId);
  }
}
