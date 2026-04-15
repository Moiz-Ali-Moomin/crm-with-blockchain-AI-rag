/**
 * Deal Domain Events
 *
 * Plain data classes — no methods, no framework dependencies.
 * Published by the application layer after a deal transitions state.
 * Consumers are infrastructure adapters (queues, websockets).
 */

export interface DomainEvent {
  readonly eventType: string;
  readonly occurredAt: Date;
}

export class DealCreatedEvent implements DomainEvent {
  readonly eventType = 'DEAL_CREATED';
  readonly occurredAt = new Date();

  constructor(
    public readonly dealId: string,
    public readonly tenantId: string,
    public readonly title: string,
    public readonly value: number,
    public readonly currency: string,
    public readonly pipelineId: string,
    public readonly stageId: string,
    public readonly ownerId: string | null,
  ) {}
}

export class DealWonEvent implements DomainEvent {
  readonly eventType = 'DEAL_WON';
  readonly occurredAt = new Date();

  constructor(
    public readonly dealId: string,
    public readonly tenantId: string,
    public readonly title: string,
    public readonly value: number,
    public readonly currency: string,
    public readonly pipelineId: string,
    public readonly ownerId: string | null,
    public readonly wonAt: Date,
  ) {}
}

export class DealLostEvent implements DomainEvent {
  readonly eventType = 'DEAL_LOST';
  readonly occurredAt = new Date();

  constructor(
    public readonly dealId: string,
    public readonly tenantId: string,
    public readonly title: string,
    public readonly ownerId: string | null,
    public readonly lostAt: Date,
    public readonly lostReason: string | null,
  ) {}
}

export class DealStageChangedEvent implements DomainEvent {
  readonly eventType = 'DEAL_STAGE_CHANGED';
  readonly occurredAt = new Date();

  constructor(
    public readonly dealId: string,
    public readonly tenantId: string,
    public readonly fromStageId: string,
    public readonly toStageId: string,
    public readonly actorId: string,
  ) {}
}

export class DealUpdatedEvent implements DomainEvent {
  readonly eventType = 'DEAL_UPDATED';
  readonly occurredAt = new Date();

  constructor(
    public readonly dealId: string,
    public readonly tenantId: string,
  ) {}
}
