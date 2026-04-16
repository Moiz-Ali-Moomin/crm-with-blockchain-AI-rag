/**
 * FireblocksCustodyAdapter
 *
 * Production custody adapter using Fireblocks MPC wallets.
 * Fireblocks handles key management, signing, and policy enforcement.
 *
 * Required env:
 *   FIREBLOCKS_API_KEY       — Fireblocks API key
 *   FIREBLOCKS_API_SECRET    — RSA private key (PEM) for request signing
 *   FIREBLOCKS_BASE_URL      — https://api.fireblocks.io
 *   FIREBLOCKS_VAULT_ACCOUNT_ID — Platform's parent vault account
 *
 * NOTE: Install @fireblocks/ts-sdk when activating this adapter.
 * This implementation uses Fireblocks REST API directly to avoid SDK version lock.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import {
  ICustodyProvider,
  CustodyWallet,
  CustodyTransferParams,
  CustodyTransferResult,
  SupportedChain,
} from './custody.interface';

// Fireblocks asset IDs
const CHAIN_TO_ASSET: Record<SupportedChain, string> = {
  POLYGON: 'USDC_POLYGON',
  BASE: 'USDC_BASE',
  ETHEREUM: 'USDC',
};


@Injectable()
export class FireblocksCustodyAdapter implements ICustodyProvider {
  private readonly logger = new Logger(FireblocksCustodyAdapter.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('FIREBLOCKS_API_KEY');
    this.apiSecret = config.getOrThrow<string>('FIREBLOCKS_API_SECRET');

    this.http = axios.create({
      baseURL: config.get<string>('FIREBLOCKS_BASE_URL', 'https://api.fireblocks.io'),
      timeout: 30_000,
    });

    // Attach JWT auth to every request
    this.http.interceptors.request.use((reqConfig) => {
      const token = this.signJwt(
        reqConfig.url ?? '',
        reqConfig.data ? JSON.stringify(reqConfig.data) : '',
      );
      reqConfig.headers['X-API-Key'] = this.apiKey;
      reqConfig.headers['Authorization'] = `Bearer ${token}`;
      return reqConfig;
    });
  }

  async generateWallet(params: {
    tenantId: string;
    label?: string;
    chain: SupportedChain;
  }): Promise<CustodyWallet> {
    // Create a vault account for this tenant wallet
    const { data: vaultAccount } = await this.http.post('/v1/vault/accounts', {
      name: params.label ?? `tenant-${params.tenantId}`,
      hiddenOnUI: false,
      autoFuel: false,
    });

    // Create wallet for the target asset within the vault
    const assetId = CHAIN_TO_ASSET[params.chain];
    const { data: assetWallet } = await this.http.post(
      `/v1/vault/accounts/${vaultAccount.id}/assets/${assetId}`,
    );

    this.logger.log(
      `Generated Fireblocks wallet for tenant ${params.tenantId}: ${assetWallet.address}`,
    );

    return {
      address: assetWallet.address,
      custodyId: vaultAccount.id,
      metadata: {
        assetId,
        vaultAccountId: vaultAccount.id,
        activationTxId: assetWallet.activationTxId,
      },
    };
  }

  async getBalance(params: {
    custodyId: string;
    chain: SupportedChain;
    tokenAddress: string;
  }): Promise<string> {
    const assetId = CHAIN_TO_ASSET[params.chain];
    const { data } = await this.http.get(
      `/v1/vault/accounts/${params.custodyId}/${assetId}`,
    );
    // Fireblocks returns balance as string in token units — convert to atomic units (×10^6)
    const balanceFloat = parseFloat(data.total ?? '0');
    const raw = BigInt(Math.round(balanceFloat * 1_000_000));
    return raw.toString();
  }

  async transfer(params: CustodyTransferParams): Promise<CustodyTransferResult> {
    const assetId = CHAIN_TO_ASSET[params.chain];
    // Convert raw atomic units back to decimal string for Fireblocks
    const amountDecimal = (BigInt(params.amountRaw) / BigInt(1_000_000)).toString() +
      '.' +
      (BigInt(params.amountRaw) % BigInt(1_000_000)).toString().padStart(6, '0');

    const { data } = await this.http.post('/v1/transactions', {
      assetId,
      source: {
        type: 'VAULT_ACCOUNT',
        id: params.fromCustodyId,
      },
      destination: {
        type: 'ONE_TIME_ADDRESS',
        oneTimeAddress: { address: params.toAddress },
      },
      amount: amountDecimal,
      note: `idempotency:${params.idempotencyKey}`,
      externalTxId: params.idempotencyKey, // Fireblocks deduplicates on this
    });

    return {
      txHash: data.txHash ?? '',
      status: data.status === 'FAILED' ? 'FAILED' : 'SUBMITTED',
      custodyTxId: data.id,
    };
  }

  /**
   * Sign a Fireblocks API JWT.
   * https://developers.fireblocks.com/reference/signing-a-request-jwt-structure
   */
  private signJwt(uri: string, bodyHash: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      uri,
      nonce: crypto.randomUUID(),
      iat: now,
      exp: now + 55,
      sub: this.apiKey,
      bodyHash: crypto.createHash('sha256').update(bodyHash).digest('hex'),
    };

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const unsigned = `${header}.${body}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), {
      key: this.apiSecret,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    });
    return `${unsigned}.${sig.toString('base64url')}`;
  }
}
