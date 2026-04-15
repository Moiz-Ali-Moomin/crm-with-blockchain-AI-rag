/**
 * BlockchainPort
 *
 * Interface for all blockchain-related side-effects triggered by the Deals domain.
 * Use-cases import this port — never the concrete BlockchainService.
 *
 * Implementations:
 *   - BlockchainAdapter (production — delegates to BlockchainService + BullMQ)
 *   - MockBlockchainAdapter (tests)
 */

export const BLOCKCHAIN_PORT = Symbol('BLOCKCHAIN_PORT');

export interface DealHashPayload {
  tenantId: string;
  dealId: string;
  title: string;
  value: string;      // serialised as string for lossless Decimal representation
  currency: string;
  wonAt: string;      // ISO date string
  ownerId: string | null;
  pipelineId: string;
}

export interface BlockchainRegistrationPayload {
  tenantId: string;
  entityType: string;
  entityId: string;
  dataHash: string;
  payloadSnapshot: DealHashPayload;
}

export interface BlockchainPort {
  /**
   * Compute a deterministic keccak256 hash for a deal's canonical fields.
   * Pure computation — no network calls, no side-effects.
   */
  computeDealHash(payload: DealHashPayload): string;

  /**
   * Enqueue an async blockchain registration job.
   * Returns when the job is queued — NOT when the tx is confirmed.
   */
  enqueueDealRegistration(payload: BlockchainRegistrationPayload): Promise<void>;
}
