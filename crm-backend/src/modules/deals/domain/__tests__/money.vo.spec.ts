/**
 * Money Value Object Unit Tests
 */

import { Money } from '../value-objects/money.vo';
import { InvalidDealAmountError } from '../errors/deal.errors';

describe('Money', () => {
  describe('of()', () => {
    it('should create a valid Money instance', () => {
      const m = Money.of(100, 'USD');
      expect(m.amount).toBe(100);
      expect(m.currency).toBe('USD');
    });

    it('should uppercase the currency code', () => {
      const m = Money.of(50, 'usd');
      expect(m.currency).toBe('USD');
    });

    it('should accept zero amount', () => {
      const m = Money.of(0, 'USD');
      expect(m.isZero()).toBe(true);
    });

    it('should throw InvalidDealAmountError for negative amounts', () => {
      expect(() => Money.of(-1, 'USD')).toThrow(InvalidDealAmountError);
    });

    it('should throw for invalid currency codes', () => {
      expect(() => Money.of(100, 'US')).toThrow();
      expect(() => Money.of(100, '')).toThrow();
    });
  });

  describe('zero()', () => {
    it('should return zero amount with default USD currency', () => {
      const m = Money.zero();
      expect(m.amount).toBe(0);
      expect(m.currency).toBe('USD');
      expect(m.isZero()).toBe(true);
    });
  });

  describe('isPositive()', () => {
    it('returns true for positive amounts', () => {
      expect(Money.of(1, 'USD').isPositive()).toBe(true);
    });

    it('returns false for zero', () => {
      expect(Money.zero().isPositive()).toBe(false);
    });
  });

  describe('equals()', () => {
    it('returns true for equal amounts and currency', () => {
      expect(Money.of(100, 'USD').equals(Money.of(100, 'USD'))).toBe(true);
    });

    it('returns false for different amounts', () => {
      expect(Money.of(100, 'USD').equals(Money.of(200, 'USD'))).toBe(false);
    });

    it('returns false for different currencies', () => {
      expect(Money.of(100, 'USD').equals(Money.of(100, 'EUR'))).toBe(false);
    });
  });
});
