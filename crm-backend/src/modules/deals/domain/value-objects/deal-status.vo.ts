/**
 * DealStatus Value Object
 *
 * Wraps the deal status enum and enforces valid state-machine transitions.
 *
 * Allowed transitions:
 *   OPEN      → WON, LOST, ON_HOLD
 *   ON_HOLD   → OPEN, LOST
 *   WON       → (terminal — no transitions allowed)
 *   LOST      → (terminal — no transitions allowed)
 */

import { InvalidDealStateTransitionError } from '../errors/deal.errors';

export type DealStatusValue = 'OPEN' | 'WON' | 'LOST' | 'ON_HOLD';

const ALLOWED_TRANSITIONS: Record<DealStatusValue, DealStatusValue[]> = {
  OPEN:    ['WON', 'LOST', 'ON_HOLD'],
  ON_HOLD: ['OPEN', 'LOST'],
  WON:     [],
  LOST:    [],
};

export class DealStatus {
  readonly value: DealStatusValue;

  private constructor(value: DealStatusValue) {
    this.value = value;
  }

  static OPEN    = new DealStatus('OPEN');
  static WON     = new DealStatus('WON');
  static LOST    = new DealStatus('LOST');
  static ON_HOLD = new DealStatus('ON_HOLD');

  static from(value: string): DealStatus {
    const valid: DealStatusValue[] = ['OPEN', 'WON', 'LOST', 'ON_HOLD'];
    if (!valid.includes(value as DealStatusValue)) {
      throw new Error(`Unknown deal status: ${value}`);
    }
    return new DealStatus(value as DealStatusValue);
  }

  canTransitionTo(next: DealStatus): boolean {
    return ALLOWED_TRANSITIONS[this.value].includes(next.value);
  }

  transitionTo(next: DealStatus): DealStatus {
    if (!this.canTransitionTo(next)) {
      throw new InvalidDealStateTransitionError(this.value, next.value);
    }
    return next;
  }

  isTerminal(): boolean {
    return this.value === 'WON' || this.value === 'LOST';
  }

  equals(other: DealStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
