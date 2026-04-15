/**
 * Money Value Object
 *
 * Represents a monetary amount with a currency code.
 * Immutable — all mutation produces a new instance.
 *
 * Invariants:
 *   - amount ≥ 0
 *   - currency is a 3-character ISO code (e.g. "USD", "USDC")
 */

import { InvalidDealAmountError } from '../errors/deal.errors';

export class Money {
  readonly amount: number;
  readonly currency: string;

  private constructor(amount: number, currency: string) {
    if (amount < 0) throw new InvalidDealAmountError(amount);
    if (!currency || currency.length < 3 || currency.length > 5) {
      throw new Error(`Invalid currency code: ${currency}`);
    }
    this.amount = amount;
    this.currency = currency.toUpperCase();
  }

  static of(amount: number, currency: string): Money {
    return new Money(amount, currency);
  }

  static zero(currency = 'USD'): Money {
    return new Money(0, currency);
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }
}
