/**
 * DealEntity Unit Tests
 *
 * Pure domain tests — zero infrastructure dependencies.
 * These run in milliseconds without any DB or queue connections.
 */

import { DealEntity, DealProps, StageContext } from '../entities/deal.entity';
import { InvalidDealAmountError, InvalidDealStateTransitionError } from '../errors/deal.errors';
import { DealWonEvent, DealLostEvent, DealStageChangedEvent } from '../events/deal.events';

const BASE_PROPS: DealProps = {
  id:         'deal-001',
  title:      'Acme Corp Deal',
  value:      10_000,
  currency:   'USD',
  status:     'OPEN',
  stageId:    'stage-001',
  pipelineId: 'pipe-001',
  tenantId:   'tenant-001',
  ownerId:    'user-001',
};

const STAGE_REGULAR: StageContext = { id: 'stage-002', isWon: false, isLost: false };
const STAGE_WON:     StageContext = { id: 'stage-won', isWon: true,  isLost: false };
const STAGE_LOST:    StageContext = { id: 'stage-lost', isWon: false, isLost: true };

describe('DealEntity', () => {
  describe('rehydrate', () => {
    it('should create a valid entity from props', () => {
      const entity = DealEntity.rehydrate(BASE_PROPS);
      expect(entity.id).toBe('deal-001');
      expect(entity.money.amount).toBe(10_000);
      expect(entity.money.currency).toBe('USD');
      expect(entity.status.value).toBe('OPEN');
    });

    it('should throw InvalidDealAmountError for negative value', () => {
      expect(() =>
        DealEntity.rehydrate({ ...BASE_PROPS, value: -1 }),
      ).toThrow(InvalidDealAmountError);
    });

    it('should accept zero value deals', () => {
      const entity = DealEntity.rehydrate({ ...BASE_PROPS, value: 0 });
      expect(entity.money.isZero()).toBe(true);
    });
  });

  describe('transitionToStage', () => {
    it('should move OPEN deal to another stage without changing status', () => {
      const entity = DealEntity.rehydrate(BASE_PROPS);
      const result = entity.transitionToStage(STAGE_REGULAR, 'user-001');

      expect(result.updates.stageId).toBe('stage-002');
      expect(result.updates.status).toBeUndefined();
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toBeInstanceOf(DealStageChangedEvent);
    });

    it('should emit DealWonEvent when moving to WON stage', () => {
      const entity = DealEntity.rehydrate(BASE_PROPS);
      const result = entity.transitionToStage(STAGE_WON, 'user-001');

      expect(result.updates.status).toBe('WON');
      expect(result.updates.wonAt).toBeInstanceOf(Date);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toBeInstanceOf(DealWonEvent);

      const wonEvent = result.events[0] as DealWonEvent;
      expect(wonEvent.dealId).toBe('deal-001');
      expect(wonEvent.value).toBe(10_000);
      expect(wonEvent.currency).toBe('USD');
    });

    it('should emit DealLostEvent with lostReason when moving to LOST stage', () => {
      const entity = DealEntity.rehydrate(BASE_PROPS);
      const result = entity.transitionToStage(STAGE_LOST, 'user-001', 'Price too high');

      expect(result.updates.status).toBe('LOST');
      expect(result.updates.lostReason).toBe('Price too high');
      expect(result.events[0]).toBeInstanceOf(DealLostEvent);
    });

    it('should throw InvalidDealStateTransitionError for WON → OPEN', () => {
      const wonEntity = DealEntity.rehydrate({ ...BASE_PROPS, status: 'WON' });
      expect(() =>
        wonEntity.transitionToStage(STAGE_REGULAR, 'user-001'),
      ).toThrow(InvalidDealStateTransitionError);
    });

    it('should throw InvalidDealStateTransitionError for LOST → WON', () => {
      const lostEntity = DealEntity.rehydrate({ ...BASE_PROPS, status: 'LOST' });
      expect(() =>
        lostEntity.transitionToStage(STAGE_WON, 'user-001'),
      ).toThrow(InvalidDealStateTransitionError);
    });
  });

  describe('isBlockchainEligible', () => {
    it('returns true only for WON deals', () => {
      expect(DealEntity.rehydrate({ ...BASE_PROPS, status: 'WON' }).isBlockchainEligible()).toBe(true);
      expect(DealEntity.rehydrate({ ...BASE_PROPS, status: 'OPEN' }).isBlockchainEligible()).toBe(false);
      expect(DealEntity.rehydrate({ ...BASE_PROPS, status: 'LOST' }).isBlockchainEligible()).toBe(false);
    });
  });

  describe('isUsdcPaymentEligible', () => {
    it('returns true for USDC deals with positive value', () => {
      const entity = DealEntity.rehydrate({ ...BASE_PROPS, value: 5000, currency: 'USDC' });
      expect(entity.isUsdcPaymentEligible()).toBe(true);
    });

    it('returns false for USD deals', () => {
      const entity = DealEntity.rehydrate({ ...BASE_PROPS, currency: 'USD' });
      expect(entity.isUsdcPaymentEligible()).toBe(false);
    });

    it('returns false for zero-value USDC deals', () => {
      const entity = DealEntity.rehydrate({ ...BASE_PROPS, value: 0, currency: 'USDC' });
      expect(entity.isUsdcPaymentEligible()).toBe(false);
    });
  });
});
