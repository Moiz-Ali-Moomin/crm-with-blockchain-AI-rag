/**
 * PaymentListenerService
 *
 * Real-time USDC Transfer event ingestion for the payment rail.
 *
 * Mode selection:
 *   1. WebSocket subscription (preferred) — zero-latency push events via ethers Contract.on()
 *   2. HTTP polling fallback — activated automatically when WS is unavailable or drops
 *   3. Automatic mode switching — background watchdog checks every 30 s and upgrades
 *      back to WS once EthereumProviderService reports wsConnected = true
 *
 * Idempotency:
 *   Every event is enqueued with jobId = `transfer:{txHash}:{logIndex}`.
 *   BullMQ drops the duplicate silently — reconnects and polling overlaps are safe.
 *
 * Fault tolerance:
 *   - Never throws in the event handler; errors are logged and swallowed
 *   - Never crashes the process on enqueue failure
 *   - Polling errors are caught per-tick; the timer always reschedules
 *
 * Environment variables:
 *   CHAIN_NAME           — label embedded in queued jobs (default: "ETHEREUM")
 *   POLLING_INTERVAL_MS  — HTTP poll cadence when WS is down (default: 12 000 ms)
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

/** Scan back this many blocks on first connection to catch any events missed during startup */
const SUBSCRIBE_LOOKBACK_BLOCKS = 20;
/** Default HTTP polling cadence — ~1 Ethereum block */
const DEFAULT_POLL_INTERVAL_MS  = 12_000;
/** Watchdog checks every 30 s whether WS state has changed */
const MODE_WATCHDOG_INTERVAL_MS = 30_000;

/** Shape of every job pushed to the blockchain-events queue */
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

  private _mode:            ListenerMode = 'idle';
  private _wsContract:      ethers.Contract | null = null;
  private _pollTimer:       NodeJS.Timeout | null = null;
  private _watchdogTimer:   NodeJS.Timeout | null = null;
  private _lastPolledBlock  = 0;
  private readonly _chain:  string;
  private readonly _pollMs: number;

  constructor(
    private readonly provider:    EthereumProviderService,
    private readonly usdc:        UsdcContractService,
    private readonly config:      ConfigService,
    @InjectQueue(QUEUE_NAMES.BLOCKCHAIN_EVENTS)
    private readonly eventsQueue: Queue,
  ) {
    this._chain  = this.config.get<string>('CHAIN_NAME', 'ETHEREUM');
    this._pollMs = this.config.get<number>('POLLING_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async onApplicationBootstrap(): Promise<void> {
    await this.activate();
    this.startWatchdog();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopWatchdog();
    this.stopPolling();
    await this.teardownWsSubscription();
  }

  // ─── Mode Activation ───────────────────────────────────────────────────────

  private async activate(): Promise<void> {
    if (this.provider.wsConnected) {
      await this.startWsSubscription();
    } else {
      await this.startPolling();
    }
  }

  // ─── WebSocket Subscription ────────────────────────────────────────────────

  private async startWsSubscription(): Promise<void> {
    if (this._mode === 'ws') return;

    this.stopPolling(); // cancel any active HTTP polling

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

  private async onWsTransfer(
    from:  string,
    to:    string,
    value: bigint,
    event: ethers.EventLog,
  ): Promise<void> {
    await this.enqueueTransfer({
      txHash:      event.transactionHash,
      blockNumber: event.blockNumber,
      logIndex:    event.index,
      fromAddress: from.toLowerCase(),
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
      // Start from 0 — will catch up on next tick
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
      if (this._mode !== 'polling') return; // mode changed — stop

      try {
        await this.pollNewBlocks();
      } catch (err) {
        this.logger.error(
          `[${this._chain}] PaymentListener: poll error: ${(err as Error).message}`,
        );
      }

      // Reschedule only if still in polling mode
      if (this._mode === 'polling') this.schedulePoll();
    }, this._pollMs);
  }

  private async pollNewBlocks(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    if (currentBlock <= this._lastPolledBlock) return; // no new blocks

    const fromBlock = this._lastPolledBlock + 1;
    const toBlock   = currentBlock;

    const filter = this.usdc.buildInboundTransferFilter(); // all inbound transfers
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

  // ─── Mode Watchdog ─────────────────────────────────────────────────────────

  /**
   * Periodically checks whether the WS/HTTP mode should be switched.
   * - polling + wsConnected  → upgrade to WS
   * - ws + !wsConnected      → downgrade to HTTP polling
   */
  private startWatchdog(): void {
    this._watchdogTimer = setInterval(async () => {
      if (this._mode === 'polling' && this.provider.wsConnected) {
        this.logger.log(`[${this._chain}] PaymentListener: WS back — upgrading from polling`);
        this._mode = 'idle'; // prevent re-entry
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
    // jobId = transfer:{txHash}:{logIndex} — BullMQ silently drops duplicates.
    // This makes reconnects, polling overlaps, and retries all safe.
    const jobId = `transfer:${job.txHash}:${job.logIndex}`;

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
      // Never propagate — a queue error must not crash the listener
      this.logger.error(
        `[${this._chain}] PaymentListener: failed to enqueue ${jobId}: ${(err as Error).message}`,
      );
    }
  }
}
