/**
 * EthereumPaymentModule
 *
 * Self-contained NestJS module for the USDC payment rail blockchain layer.
 *
 * Provides:
 *   EthereumProviderService — ethers.js WS + HTTP provider / signer management
 *   UsdcContractService     — USDC ERC-20 encoding, decoding, and transfer
 *   PaymentListenerService  — real-time Transfer event ingestion (WS + polling fallback)
 *
 * This module is intentionally separate from the existing BlockchainModule
 * (src/modules/blockchain/) which owns deal-hash notarisation on-chain.
 * Both modules can coexist — their listeners push to the same blockchain-events
 * queue with deduplicated jobIds so the payment processor is never double-invoked.
 *
 * Import this module in AppModule alongside JobsModule.
 * Do NOT import it from JobsModule — the listener must start before workers boot.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EthereumProviderService } from './blockchain.service';
import { UsdcContractService }     from './usdc.contract';
import { PaymentListenerService }  from './blockchain.listener';
import { QUEUE_NAMES }             from '../core/queue/queue.constants';

@Module({
  imports: [
    ConfigModule,
    // The listener is a producer for this queue — workers are registered elsewhere
    BullModule.registerQueue({ name: QUEUE_NAMES.BLOCKCHAIN_EVENTS }),
  ],
  providers: [
    EthereumProviderService,
    UsdcContractService,
    PaymentListenerService,
  ],
  exports: [
    // Export all three so ProcessorsModule and other consumers can inject them
    EthereumProviderService,
    UsdcContractService,
    PaymentListenerService,
  ],
})
export class EthereumPaymentModule {}
