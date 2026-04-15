/**
 * Deal Domain Errors
 *
 * Typed, framework-agnostic errors thrown exclusively by the Domain layer.
 * The AllExceptionsFilter maps these to HTTP 422 (business rule) responses.
 */

import { DomainError } from '../../../../shared/errors/domain.errors';

/** Attempted an invalid state transition (e.g. WON → OPEN) */
export class InvalidDealStateTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(
      `Cannot transition deal from ${from} to ${to}`,
      'INVALID_DEAL_STATE_TRANSITION',
    );
  }
}

/** Deal value is negative or otherwise invalid */
export class InvalidDealAmountError extends DomainError {
  constructor(amount: number | string) {
    super(`Deal amount must be ≥ 0, got: ${amount}`, 'INVALID_DEAL_AMOUNT');
  }
}

/** Stage does not belong to the specified pipeline */
export class StagePipelineMismatchError extends DomainError {
  constructor(stageId: string, pipelineId: string) {
    super(
      `Stage ${stageId} does not belong to pipeline ${pipelineId}`,
      'STAGE_PIPELINE_MISMATCH',
    );
  }
}

/** Cannot delete a deal that has a confirmed on-chain record */
export class CannotDeleteConfirmedDealError extends DomainError {
  constructor(dealId: string) {
    super(
      `Deal ${dealId} has a confirmed blockchain record and cannot be deleted`,
      'CANNOT_DELETE_CONFIRMED_DEAL',
    );
  }
}
