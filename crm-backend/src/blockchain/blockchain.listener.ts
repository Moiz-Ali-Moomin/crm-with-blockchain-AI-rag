/**
 * PaymentListenerService
 *
 * Real-time USDC Transfer event ingestion for the payment rail.
 *
 * Leader election (Redis SET NX):
 *   On startup each instance races for `listener_leader:{chain}` (TTL 30 s).
 *   Winner becomes ACTIVE and runs WS / HTTP polling.
 *   Loser becomes STANDBY: no subscriptions, no polling — only a lightweight
 *   probe loop that watches for the leader key to disappear, then re-races.
 *   Active instance renews its key every 10 s; if renewal fails it self-demotes
 *   to standby so the next standby probe can take over immediately.
 *
 * Mode override (LISTENER_MODE env var):
 *   active  — always active, bypass Redis election
 *   standby — always standby, bypass Redis election
 *   auto    — Redis election (default)
 *
 * WS ↔ HTTP fallback (unchanged):
 *   1. WebSocket subscription (preferred) — zero-latency push events
 *   2. HTTP polling fallback — activated when WS is unavailable or drops
 *   3. Watchdog — upgrades back to WS every 30 s once WS is healthy
 *
 * Idempotency:
 *   jobId = `transfer:{txHash}:{logIndex}` — BullMQ drops duplicates silently.
 *
 * Environment variables:
 *   CHAIN_NAME           — label embedded in queued jobs (default: "ETHEREUM")
 *   POLLING_INTERVAL_MS  — HTTP poll cadence when WS is down (default: 12 000 ms)
 *   LISTENER_MODE        — active | standby | auto (default: auto)
 */

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ethers } from 'ethers';
import { EthereumProviderService } from './blockchain.service';
import { UsdcContractService } from './usdc.contract';
import { QUEUE_NAMES, QUEUE_JOB_OPTIONS } from '../core/queue/queue.constants';
import { LeaderElectionService } from '../core/leader/leader-election.service';

const SUBSCRIBE_LOOKBACK_BLOCKS  = 20;
const DEFAULT_POLL_INTERVAL_MS   = 12_000;
const MODE_WATCHDOG_INTERVAL_MS  = 30_000;

export interface IncomingTransferJob {
  txHash:      string;
  blockNumber: number;
  logIndex:    number;
  fromAddress: string;
  toAddress:   string;
  /** USDC amount in atomic units (6 decimals), as a string for safe JSON transport */
  amountRaw:   string;
  chain:       string;
  /** Unix seconds — best-effort, used only for debugging */
  timestamp:   number;
}

type ListenerMode = 'ws' | 'polling' | 'idle';

@Injectable()
export class PaymentListenerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PaymentListenerService.name);

  // WS / polling state (unchanged)
  private _mode:            ListenerMode = 'idle';
  private _wsContract:      ethers.Contract | null = null;
  private _pollTimer:       NodeJS.Timeout | null = null;
  private _watchdogTimer:   NodeJS.Timeout | null = null;
  private _lastPolledBlock  = 0;

  // Leader election state
  private _leaderState:     'active' | 'standby' = 'standby';
  private _renewalTimer:    NodeJS.Timeout | null = null;
  private _standbyTimer:    NodeJS.Timeout | null = null;

  private readonly _chain:  string;
  private readonly _pollMs: number;

  constructor(
    private readonly provider:    EthereumProviderService,
    private readonly usdc:        UsdcContractService,
    private readonly config:      ConfigService,
    private readonly leader:      LeaderElectionService,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN_EVENTS)
    private readonly eventsQueue: Queue,
  ) {
    this._chain  = this.config.get<string>('CHAIN_NAME', 'ETHEREUM');
    this._pollMs = this.config.get<number>('POLLING_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    const isActive = await this.leader.tryAcquire(this._chain);
    if (isActive) {
      await this.becomeActive();
    } else {
      this.becomeStandby();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopRenewal();
    this.stopStandbyProbe();
    this.stopWatchdog();
    this.stopPolling();
    await this.teardownWsSubscription();

    if (this._leaderState === 'active') {
      await this.leader.release(this._chain);
    }
  }

  // ─── Leader State Transitions ──────────────────────────────────────────────

  private async becomeActive(): Promise<void> {
    this._leaderState = 'active';
    this.stopStandbyProbe();
    await this.activateIngestion();
    this.startWatchdog();
    this.startRenewal();
  }

  private async becomeStandby(): Promise<void> {
    this._leaderState = 'standby';
    this.stopRenewal();
    this.stopWatchdog();
    this.stopPolling();
    await this.teardownWsSubscription();
    this._mode = 'idle';
    this.startStandbyProbe();
  }

  // ─── Renewal (active instances only) ──────────────────────────────────────

  private startRenewal(): void {
    this._renewalTimer = setInterval(async () => {
      const ok = await this.leader.renew(this._chain).catch(() => false);
      if (!ok) {
        await this.becomeStandby();
      }
    }, this.leader.renewIntervalMs);
  }

  private stopRenewal(): void {
    if (this._renewalTimer) {
      clearInterval(this._renewalTimer);
      this._renewalTimer = null;
    }
  }

  // ─── Standby Probe (standby instances only) ────────────────────────────────

  private startStandbyProbe(): void {
    this._standbyTimer = setInterval(async () => {
      if (this._leaderState !== 'standby') return;

      try {
        const absent = await this.leader.isLeaderAbsent(this._chain);
        if (!absent) return;

        const acquired = await this.leader.tryAcquire(this._chain);
        if (acquired) {
          await this.becomeActive();
        }
      } catch (err) {
        this.logger.error(
          `[${this._chain}] standby probe error: ${(err as Error).message}`,
        );
      }
    }, this.leader.standbyProbeIntervalMs);
  }

  private stopStandbyProbe(): void {
    if (this._standbyTimer) {
      clearInterval(this._standbyTimer);
      this._standbyTimer = null;
    }
  }

  // ─── Ingestion Activation ──────────────────────────────────────────────────

  private async activateIngestion(): Promise<void> {
    if (this.provider.wsConnected) {
      await this.startWsSubscription();
    } else {
      await this.startPolling();
    }
  }

  // ─── WebSocket Subscription ────────────────────────────────────────────────

  private async startWsSubscription(): Promise<void> {
    if (this._mode === 'ws') return;

    this.stopPolling();

    try {
      const currentBlock    = await this.provider.getBlockNumber();
      this._lastPolledBlock = Math.max(0, currentBlock - SUBSCRIBE_LOOKBACK_BLOCKS);

      const wsProvider   = this.provider.getProvider();
      this._wsContract   = this.usdc.getContract(wsProvider);
      this._mode         = 'ws';

      this._wsContract.on('Transfer', this.onWsTransfer.bind(this));

      this.logger.log(
        `[${this._chain}] PaymentListener: WS subscription active ` +
        `on USDC ${this.usdc.contractAddress} (from block ~${this._lastPolledBlock})`,
      );
    } catch (err) {
      this.logger.error(
        `[${this._chain}] PaymentListener: WS subscription failed — starting HTTP polling: ` +
        `${(err as Error).message}`,
      );
      this._mode = 'idle';
      await this.startPolling();
    }
  }

  private async teardownWsSubscription(): Promise<void> {
    if (this._wsContract) {
      await this._wsContract.removeAllListeners('Transfer').catch(() => {});
      this._wsContract = null;
    }
  }

  /**
   * ethers v6: last arg is ContractEventPayload, not EventLog.
   * Decoded args arrive before the payload; the underlying Log is at payload.log.
   */
  private async onWsTransfer(
    _from:   string,
    _to:     string,
    _value:  bigint,
    payload: ethers.ContractEventPayload,
  ): Promise<void> {
    const log = payload?.log;

    const from  = (payload?.args?.from  ?? payload?.args?.[0] ?? _from)  as string;
    const to    = (payload?.args?.to    ?? payload?.args?.[1] ?? _to)    as string;
    const value = (payload?.args?.value ?? payload?.args?.[2] ?? _value) as bigint;

    const txHash   = log?.transactionHash;
    const logIndex = log?.index ?? 0;

    if (!txHash) {
      this.logger.error(`[${this._chain}] Missing txHash in Transfer event — skipping`, { args: payload?.args });
      return;
    }

    await this.enqueueTransfer({
      txHash,
      blockNumber: log?.blockNumber ?? 0,
      logIndex,
      fromAddress: from?.toLowerCase?.() ?? '',
      toAddress:   to.toLowerCase(),
      amountRaw:   value.toString(),
      chain:       this._chain,
      timestamp:   Math.floor(Date.now() / 1000),
    });
  }

  // ─── HTTP Polling Fallback ─────────────────────────────────────────────────

  private async startPolling(): Promise<void> {
    if (this._mode === 'polling') return;

    await this.teardownWsSubscription();

    try {
      this._lastPolledBlock = await this.provider.getBlockNumber();
    } catch (err) {
      this.logger.error(
        `[${this._chain}] PaymentListener: could not get current block for polling baseline: ` +
        `${(err as Error).message}`,
      );
      this._lastPolledBlock = 0;
    }

    this._mode = 'polling';
    this.logger.log(
      `[${this._chain}] PaymentListener: HTTP polling every ${this._pollMs}ms ` +
      `(from block ${this._lastPolledBlock})`,
    );

    this.schedulePoll();
  }

  private stopPolling(): void {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  }

  private schedulePoll(): void {
    this._pollTimer = setTimeout(async () => {
      this._pollTimer = null;
      if (this._mode !== 'polling') return;

      try {
        await this.pollNewBlocks();
      } catch (err) {
        this.logger.error(
          `[${this._chain}] PaymentListener: poll error: ${(err as Error).message}`,
        );
      }

      if (this._mode === 'polling') this.schedulePoll();
    }, this._pollMs);
  }

  private async pollNewBlocks(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    if (currentBlock <= this._lastPolledBlock) return;

    const fromBlock = this._lastPolledBlock + 1;
    const toBlock   = currentBlock;

    const filter = this.usdc.buildInboundTransferFilter();
    const logs   = await this.provider.getLogs(filter, fromBlock, toBlock);

    this.logger.debug(
      `[${this._chain}] PaymentListener: polled blocks ${fromBlock}–${toBlock} — ` +
      `${logs.length} Transfer log(s)`,
    );

    for (const log of logs) {
      const parsed = this.usdc.parseTransferEvent(log);
      if (!parsed) continue;

      await this.enqueueTransfer({
        txHash:      parsed.txHash,
        blockNumber: parsed.blockNumber,
        logIndex:    parsed.logIndex,
        fromAddress: parsed.from.toLowerCase(),
        toAddress:   parsed.to.toLowerCase(),
        amountRaw:   parsed.amountRaw,
        chain:       this._chain,
        timestamp:   Math.floor(Date.now() / 1000),
      });
    }

    this._lastPolledBlock = toBlock;
  }

  // ─── Mode Watchdog (WS ↔ HTTP) ────────────────────────────────────────────

  private startWatchdog(): void {
    this._watchdogTimer = setInterval(async () => {
      if (this._leaderState !== 'active') return;

      if (this._mode === 'polling' && this.provider.wsConnected) {
        this.logger.log(`[${this._chain}] PaymentListener: WS back — upgrading from polling`);
        this._mode = 'idle';
        this.stopPolling();
        await this.startWsSubscription();
      } else if (this._mode === 'ws' && !this.provider.wsConnected) {
        this.logger.warn(`[${this._chain}] PaymentListener: WS lost — downgrading to HTTP polling`);
        this._mode = 'idle';
        await this.teardownWsSubscription();
        await this.startPolling();
      }
    }, MODE_WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this._watchdogTimer) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  // ─── Queue Producer ────────────────────────────────────────────────────────

  private async enqueueTransfer(job: IncomingTransferJob): Promise<void> {
    const jobId = `transfer-${job.txHash}-${job.logIndex}`;

    try {
      await this.eventsQueue.add('process_transfer', job, {
        ...QUEUE_JOB_OPTIONS.blockchainEvents,
        jobId,
      });

      this.logger.debug(
        `[${this._chain}] Queued Transfer: ${job.fromAddress.slice(0, 8)}… → ` +
        `${job.toAddress.slice(0, 8)}… | ${this.usdc.formatUsdc(BigInt(job.amountRaw))} USDC ` +
        `(${job.txHash.slice(0, 12)}…)`,
      );
    } catch (err) {
      this.logger.error(
        `[${this._chain}] PaymentListener: failed to enqueue ${jobId}: ${(err as Error).message}`,
      );
    }
  }
}
