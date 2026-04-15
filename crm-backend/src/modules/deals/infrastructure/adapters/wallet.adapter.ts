/**
 * WalletAdapter
 *
 * Implements WalletPort by delegating to WalletsService.
 * Isolates WalletsService from the deals application layer.
 */

import { Injectable } from '@nestjs/common';
import { WalletsService } from '../../../wallets/wallets.service';
import { WalletPort, WalletReadModel } from '../../application/ports/wallet.port';

@Injectable()
export class WalletAdapter implements WalletPort {
  constructor(private readonly walletsService: WalletsService) {}

  async findTenantWalletOnChain(
    tenantId: string,
    type: string,
    chain: string,
  ): Promise<WalletReadModel | null> {
    const wallets = await this.walletsService.findByTenant(tenantId);
    const match = wallets.find(
      (w: any) => w.type === type && w.chain === chain,
    );
    return match ?? null;
  }
}
