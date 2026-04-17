/**
 * UsdcContractService
 *
 * All interactions with the USDC ERC-20 contract in one place.
 *
 * Responsibilities:
 *   - Provide typed Contract instances for reads and writes
 *   - Encode `transfer` calldata for raw transaction construction
 *   - Decode Transfer event logs into strongly-typed structs
 *   - Build ethers.js event filters for log queries
 *   - Send USDC via the custodial signer (withdrawal preparation)
 *
 * USDC uses 6 decimal places:
 *   1 USDC = 1_000_000 atomic units (the raw uint256 value on-chain)
 *
 * Environment variables:
 *   USDC_CONTRACT_ADDRESS — ERC-20 contract address on the target chain
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { EthereumProviderService } from './blockchain.service';

export const USDC_DECIMALS = 6;

// Minimal ABI covering all operations needed for payment processing
export const ERC20_ABI = [
  // ── Reads ────────────────────────────────────────────────────────────────
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  // ── Writes ───────────────────────────────────────────────────────────────
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  // ── Events ───────────────────────────────────────────────────────────────
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
] as const;

export interface ParsedTransferEvent {
  /** Checksummed EVM address of the sender */
  from: string;
  /** Checksummed EVM address of the recipient */
  to: string;
  /** Raw USDC amount in atomic units — safe string, no BigInt serialisation issues */
  amountRaw: string;
  /** Human-readable USDC amount (6 decimal places) */
  amountUsdc: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
}

export interface SendUsdcResult {
  txHash: string;
  /** TransactionResponse — caller may await .wait() for a receipt */
  response: ethers.TransactionResponse;
}

@Injectable()
export class UsdcContractService {
  private readonly logger = new Logger(UsdcContractService.name);

  /** Canonical USDC contract address on the configured chain */
  readonly contractAddress: string;

  // Shared Interface instance — ABI parsing is expensive, reuse it
  private readonly _iface = new ethers.Interface(ERC20_ABI);

  constructor(
    private readonly config: ConfigService,
    private readonly ethereumProvider: EthereumProviderService,
  ) {
    this.contractAddress = this.config.getOrThrow<string>('USDC_CONTRACT_ADDRESS');
  }

  // ─── Contract Instances ────────────────────────────────────────────────────

  /**
   * Read-only Contract instance backed by the active provider.
   * Use for balanceOf, allowance, and event queries.
   */
  getReadContract(): ethers.Contract {
    return new ethers.Contract(
      this.contractAddress,
      ERC20_ABI,
      this.ethereumProvider.getProvider(),
    );
  }

  /**
   * Write-capable Contract instance backed by the custodial signer.
   * Use for transfer() and approve() calls.
   */
  getWriteContract(): ethers.Contract {
    return new ethers.Contract(
      this.contractAddress,
      ERC20_ABI,
      this.ethereumProvider.getSigner(),
    );
  }

  /**
   * Contract instance connected to an arbitrary signer or provider.
   * Useful when the caller controls the connection (e.g. per-chain multi-sig).
   */
  getContract(connection: ethers.Signer | ethers.Provider): ethers.Contract {
    return new ethers.Contract(this.contractAddress, ERC20_ABI, connection);
  }

  // ─── Calldata Encoding ─────────────────────────────────────────────────────

  /**
   * ABI-encode a transfer(to, amount) call.
   * Returns hex calldata — use in TransactionRequest.data for raw tx construction.
   */
  encodeTransfer(to: string, amountRaw: bigint): string {
    return this._iface.encodeFunctionData('transfer', [
      ethers.getAddress(to), // enforce checksum
      amountRaw,
    ]);
  }

  /**
   * Build a complete TransactionRequest for a USDC transfer.
   * Pass to EthereumProviderService.sendTransaction() for broadcast.
   */
  buildTransferTx(to: string, amountRaw: bigint): ethers.TransactionRequest {
    return {
      to:   this.contractAddress,
      data: this.encodeTransfer(to, amountRaw),
    };
  }

  // ─── Event Parsing ─────────────────────────────────────────────────────────

  /**
   * Decode a raw EVM log into a typed ParsedTransferEvent.
   * Returns null when the log does not match the Transfer(address,address,uint256) signature —
   * this is safe to call on any log in a block without pre-filtering.
   */
  parseTransferEvent(log: ethers.Log): ParsedTransferEvent | null {
    try {
      const parsed = this._iface.parseLog({
        topics: [...log.topics],
        data:   log.data,
      });

      if (!parsed || parsed.name !== 'Transfer') return null;

      const amountRaw = parsed.args.value as bigint;

      return {
        from:        ethers.getAddress(parsed.args.from as string),
        to:          ethers.getAddress(parsed.args.to as string),
        amountRaw:   amountRaw.toString(),
        amountUsdc:  this.formatUsdc(amountRaw),
        txHash:      log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex:    log.index,
      };
    } catch (err) {
      // Non-Transfer logs throw during parseLog — not an error condition
      this.logger.debug(`parseTransferEvent: skipped log (${(err as Error).message})`);
      return null;
    }
  }

  // ─── Unit Conversion ───────────────────────────────────────────────────────

  /** Parse a human-readable USDC string ("100.50") into atomic units. */
  toAtomicUnits(usdcAmount: string): bigint {
    return ethers.parseUnits(usdcAmount, USDC_DECIMALS);
  }

  /** Format atomic units as a human-readable USDC string ("100.500000"). */
  formatUsdc(amountRaw: bigint): string {
    return ethers.formatUnits(amountRaw, USDC_DECIMALS);
  }

  // ─── Filters ───────────────────────────────────────────────────────────────

  /**
   * Build an ethers Filter for Transfer events directed at a specific address.
   * Pass toAddress = undefined to match all Transfer events on the contract.
   *
   * Topic layout for Transfer(address indexed from, address indexed to, uint256 value):
   *   topics[0] = event signature hash
   *   topics[1] = from (indexed) — null = any
   *   topics[2] = to   (indexed) — padded to 32 bytes
   */
  buildInboundTransferFilter(toAddress?: string): ethers.Filter {
    const transferTopic = this._iface.getEvent('Transfer')!.topicHash;

    const paddedTo = toAddress
      ? ethers.zeroPadValue(ethers.getAddress(toAddress), 32)
      : null;

    return {
      address: this.contractAddress,
      topics:  paddedTo
        ? [transferTopic, null, paddedTo] as string[]
        : [transferTopic],
    };
  }

  // ─── Withdrawal ────────────────────────────────────────────────────────────

  /**
   * Submit a USDC transfer from the custodial signer to the given address.
   * This is the local-custody implementation — production replaces this
   * with the Fireblocks adapter via the custody provider abstraction.
   *
   * @param to        — destination EVM address (checksummed or raw)
   * @param amountRaw — amount in atomic units (USDC 6 decimals)
   * @returns txHash and the TransactionResponse for receipt polling
   */
  async sendUsdc(to: string, amountRaw: bigint): Promise<SendUsdcResult> {
    const checksummed = ethers.getAddress(to);
    const humanAmount = this.formatUsdc(amountRaw);

    this.logger.log(
      `Sending ${humanAmount} USDC → ${checksummed} (${amountRaw} atomic units)`,
    );

    // Strategy: call contract.transfer() — gas is estimated automatically
    const writeContract = this.getWriteContract();
    const tx: ethers.TransactionResponse = await writeContract.transfer(checksummed, amountRaw);

    this.logger.log(`USDC transfer submitted: txHash=${tx.hash}`);

    return { txHash: tx.hash, response: tx };
  }

  /**
   * sendUsdc alternative using raw calldata via EthereumProviderService.sendTransaction().
   * Functionally identical — included to demonstrate the sendTransaction() path
   * required by the spec. Fireblocks adapter will use this path.
   */
  async sendUsdcRaw(to: string, amountRaw: bigint): Promise<SendUsdcResult> {
    const tx = await this.ethereumProvider.sendTransaction(
      this.buildTransferTx(to, amountRaw),
    );

    this.logger.log(`USDC transfer (raw) submitted: txHash=${tx.hash}`);
    return { txHash: tx.hash, response: tx };
  }
}
