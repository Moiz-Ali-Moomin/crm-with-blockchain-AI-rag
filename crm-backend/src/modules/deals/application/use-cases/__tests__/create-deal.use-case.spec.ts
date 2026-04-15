/**
 * CreateDealUseCase Unit Tests
 *
 * Uses Jest mocks for all ports — no database, no queues, no network.
 * Tests the orchestration logic in isolation.
 */

import { CreateDealUseCase } from '../create-deal.use-case';
import { DEAL_REPOSITORY_PORT, DealRepositoryPort } from '../../ports/deal.repository.port';
import { EVENT_PUBLISHER_PORT, EventPublisherPort } from '../../ports/event-publisher.port';
import { StagePipelineMismatchError } from '../../../domain/errors/deal.errors';
import { Test, TestingModule } from '@nestjs/testing';

// ── Mock helpers ─────────────────────────────────────────────────────────────

const mockStage = {
  id: 'stage-001', name: 'Proposal', color: '#blue', position: 1,
  probability: 0.3, pipelineId: 'pipe-001', isWon: false, isLost: false,
};

const mockDeal = {
  id: 'deal-001', title: 'Test Deal', value: 5000, currency: 'USD',
  status: 'OPEN', stageId: 'stage-001', pipelineId: 'pipe-001',
  tenantId: 'tenant-001', ownerId: 'user-001', contactId: null,
  companyId: null, tags: [], wonAt: null, lostAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const makeMockRepo = (): jest.Mocked<DealRepositoryPort> => ({
  create:               jest.fn().mockResolvedValue(mockDeal),
  update:               jest.fn(),
  updateInTransaction:  jest.fn(),
  delete:               jest.fn(),
  recordStageHistory:   jest.fn().mockResolvedValue(undefined),
  findById:             jest.fn(),
  findAll:              jest.fn(),
  findStageInPipeline:  jest.fn().mockResolvedValue(mockStage),
  getKanbanBoard:       jest.fn(),
  getForecast:          jest.fn(),
});

const makeMockEventPublisher = (): jest.Mocked<EventPublisherPort> => ({
  publishAutomation:  jest.fn().mockResolvedValue(undefined),
  publishWebhook:     jest.fn().mockResolvedValue(undefined),
  publishNotification: jest.fn().mockResolvedValue(undefined),
  emitWebSocket:      jest.fn(),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateDealUseCase', () => {
  let useCase: CreateDealUseCase;
  let mockRepo: jest.Mocked<DealRepositoryPort>;
  let mockPublisher: jest.Mocked<EventPublisherPort>;

  beforeEach(async () => {
    mockRepo      = makeMockRepo();
    mockPublisher = makeMockEventPublisher();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateDealUseCase,
        { provide: DEAL_REPOSITORY_PORT, useValue: mockRepo },
        { provide: EVENT_PUBLISHER_PORT, useValue: mockPublisher },
      ],
    }).compile();

    useCase = module.get(CreateDealUseCase);
  });

  const dto = {
    title: 'Test Deal', value: 5000, currency: 'USD',
    pipelineId: 'pipe-001', stageId: 'stage-001',
    tags: [], customFields: {},
  };

  it('should create a deal when stage belongs to pipeline', async () => {
    const result = await useCase.execute(dto, 'user-001', 'tenant-001');

    expect(result.id).toBe('deal-001');
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.recordStageHistory).toHaveBeenCalledTimes(1);
  });

  it('should fire automation and webhook events after creation', async () => {
    await useCase.execute(dto, 'user-001', 'tenant-001');

    expect(mockPublisher.publishAutomation).toHaveBeenCalledWith(
      'tenant-001', 'DEAL_CREATED', 'deal-001', expect.anything(),
    );
    expect(mockPublisher.publishWebhook).toHaveBeenCalledWith(
      'tenant-001', 'DEAL_CREATED', expect.anything(),
    );
    expect(mockPublisher.emitWebSocket).toHaveBeenCalledTimes(1);
  });

  it('should throw StagePipelineMismatchError when stage is not in pipeline', async () => {
    mockRepo.findStageInPipeline.mockResolvedValue(null);

    await expect(
      useCase.execute(dto, 'user-001', 'tenant-001'),
    ).rejects.toThrow(StagePipelineMismatchError);

    expect(mockRepo.create).not.toHaveBeenCalled();
    expect(mockPublisher.publishAutomation).not.toHaveBeenCalled();
  });

  it('should not persist deal if stage validation fails', async () => {
    mockRepo.findStageInPipeline.mockResolvedValue(null);

    await expect(useCase.execute(dto, 'user-001', 'tenant-001')).rejects.toThrow();

    expect(mockRepo.create).not.toHaveBeenCalled();
    expect(mockRepo.recordStageHistory).not.toHaveBeenCalled();
  });
});
