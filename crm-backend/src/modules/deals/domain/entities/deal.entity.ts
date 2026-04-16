/**
 * Deal Aggregate Root (Domain Entity)
 *
 * The single source of truth for all Deal business rules and invariants.
 *
 * Responsibilities:
 *   - Enforce amount ≥ 0 (Money value object)
 *   - Enforce valid state-machine transitions (DealStatus value object)
 *   - Emit domain events for significant lifecycle changes
 *
 * Rules:
 *   - NO external dependencies (no NestJS, no Prisma, no BullMQ)
 *   - All mutations return a NEW entity + collected events (immutable-style)
 *   - The entity never persists itself — that is the repository's job
 *
 * Lifecycle:
 *   OPEN ─┬─▶ WON  (terminal)
 *         ├─▶ LOST (terminal)
 *         └─▶ ON_HOLD ──▶ OPEN | LOST
 */

import { Money } from '../value-objects/money.vo';
import { DealStatus } from '../value-objects/deal-status.vo';
import {
  DomainEvent,
  DealWonEvent,
  DealLostEvent,
  DealStageChangedEvent,
} from '../events/deal.events';
import { InvalidDealAmountError, InvalidDealStateTransitionError } from '../errors/deal.errors';

export interface DealProps {
  id: string;
  title: string;
  value: number;       // numeric representation (Prisma Decimal → number)
  currency: string;
  status: string;
  stageId: string;
  pipelineId: string;
  tenantId: string;
  ownerId: string | null;
  contactId?: string | null;
  companyId?: string | null;
  wonAt?: Date | null;
  lostAt?: Date | null;
  lostReason?: string | null;
}

export interface StageContext {
  id: string;
  isWon: boolean;
  isLost: boolean;
}

export interface TransitionResult {
  entity: DealEntity;
  events: DomainEvent[];
  updates: {
    stageId: string;
    status?: string;
    wonAt?: Date;
    lostAt?: Date;
    lostReason?: string;
  };
}

export class DealEntity {
  readonly id: string;
  readonly title: string;
  readonly money: Money;
  readonly status: DealStatus;
  readonly stageId: string;
  readonly pipelineId: string;
  readonly tenantId: string;
  readonly ownerId: string | null;
  readonly contactId: string | null;
  readonly companyId: string | null;
  readonly wonAt: Date | null;
  readonly lostAt: Date | null;
  readonly lostReason: string | null;

  private constructor(props: DealProps) {
    if (props.value < 0) throw new InvalidDealAmountError(props.value);

    this.id          = props.id;
    this.title       = props.title;
    this.money       = Money.of(props.value, props.currency);
    this.status      = DealStatus.from(props.status);
    this.stageId     = props.stageId;
    this.pipelineId  = props.pipelineId;
    this.tenantId    = props.tenantId;
    this.ownerId     = props.ownerId;
    this.contactId   = props.contactId ?? null;
    this.companyId   = props.companyId ?? null;
    this.wonAt       = props.wonAt ?? null;
    this.lostAt      = props.lostAt ?? null;
    this.lostReason  = props.lostReason ?? null;
  }

  /** Rehydrate an entity from a persistence read model */
  static rehydrate(props: DealProps): DealEntity {
    return new DealEntity(props);
  }

  /**
   * Core state-machine operation: move the deal to a new stage.
   *
   * Determines the new status from the stage context (isWon / isLost),
   * validates the transition, and emits the appropriate domain event.
   *
   * Returns an immutable TransitionResult containing:
   *   - the updated entity
   *   - collected domain events
   *   - the raw updates to persist
   */
  transitionToStage(
    newStage: StageContext,
    actorId: string,
    lostReason?: string,
  ): TransitionResult {
    const events: DomainEvent[] = [];
    const now = new Date();

    const updates: TransitionResult['updates'] = {
      stageId: newStage.id,
    };

    let nextStatus: DealStatus;

    // Guard: terminal states cannot be transitioned from at all.
    // This must come BEFORE the isWon/isLost branch checks so that
    // WON → any-regular-stage is caught here (not silently allowed).
    if (this.status.isTerminal() && !newStage.isWon && !newStage.isLost) {
      throw new InvalidDealStateTransitionError(this.status.value, 'REGULAR_STAGE');
    }

    if (newStage.isWon) {
      nextStatus = DealStatus.WON;
      updates.status = 'WON';
      updates.wonAt  = now;

      // Domain enforces the valid transition
      this.status.transitionTo(nextStatus);

      events.push(
        new DealWonEvent(
          this.id,
          this.tenantId,
          this.title,
          this.money.amount,
          this.money.currency,
          this.pipelineId,
          this.ownerId,
          now,
        ),
      );
    } else if (newStage.isLost) {
      nextStatus = DealStatus.LOST;
      updates.status   = 'LOST';
      updates.lostAt   = now;
      if (lostReason) updates.lostReason = lostReason;

      this.status.transitionTo(nextStatus);

      events.push(
        new DealLostEvent(
          this.id,
          this.tenantId,
          this.title,
          this.ownerId,
          now,
          lostReason ?? null,
        ),
      );
    } else {
      // Regular stage move within OPEN pipeline
      // If currently ON_HOLD and moving to a regular stage, restore to OPEN
      if (this.status.value === 'ON_HOLD') {
        nextStatus = DealStatus.OPEN;
        updates.status = 'OPEN';
        this.status.transitionTo(nextStatus);
      } else {
        nextStatus = this.status;
      }

      events.push(
        new DealStageChangedEvent(
          this.id,
          this.tenantId,
          this.stageId,
          newStage.id,
          actorId,
        ),
      );
    }

    const updatedEntity = DealEntity.rehydrate({
      id:          this.id,
      title:       this.title,
      value:       this.money.amount,
      currency:    this.money.currency,
      status:      nextStatus?.value ?? this.status.value,
      stageId:     newStage.id,
      pipelineId:  this.pipelineId,
      tenantId:    this.tenantId,
      ownerId:     this.ownerId,
      contactId:   this.contactId,
      companyId:   this.companyId,
      wonAt:       updates.wonAt ?? this.wonAt,
      lostAt:      updates.lostAt ?? this.lostAt,
      lostReason:  updates.lostReason ?? this.lostReason,
    });

    return { entity: updatedEntity, events, updates };
  }

  /** Is this deal eligible for blockchain registration? */
  isBlockchainEligible(): boolean {
    return this.status.value === 'WON';
  }

  /** Is this deal eligible for USDC payment flow? */
  isUsdcPaymentEligible(): boolean {
    return this.money.currency === 'USDC' && this.money.isPositive();
  }
}
