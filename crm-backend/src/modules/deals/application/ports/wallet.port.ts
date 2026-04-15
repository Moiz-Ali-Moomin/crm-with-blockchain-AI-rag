/**
 * WalletPort
 *
 * Interface for wallet lookups needed by the Deals application layer.
 * Isolates the WalletsService from use-cases.
 */

export const WALLET_PORT = Symbol('WALLET_PORT');

export interface WalletReadModel {
  id: string;
  type: string;
  chain: string;
  address: string;
  tenantId: string;
}

export interface WalletPort {
  /**
   * Find the tenant's primary wallet on a given chain.
   * Returns null if no wallet is configured — callers must handle gracefully.
   */
  findTenantWalletOnChain(
    tenantId: string,
    type: string,
    chain: string,
  ): Promise<WalletReadModel | null>;
}
