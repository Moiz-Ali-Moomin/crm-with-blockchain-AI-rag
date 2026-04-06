# Blockchain — Deal Hash Registry

## Overview

When a deal is marked **WON**, NexusCRM registers a tamper-proof fingerprint of the deal on an EVM-compatible blockchain (default: Polygon Mumbai testnet).

**What is stored on-chain:** A `keccak256` hash of the deal's canonical fields — not the deal data itself. No PII ever leaves the CRM.

**Why:** Provides an immutable audit trail proving the deal existed with those exact values at a specific point in time. Useful for compliance, dispute resolution, and contractual verification.

---

## How It Works

```
Deal marked WON
       │
       ▼
DealsService.moveStage()
       │
       ├─ Creates blockchain_records row (status: PENDING)
       │
       └─ Enqueues BullMQ job → blockchain queue
                                      │
                                      ▼
                             BlockchainWorker
                                      │
                             BlockchainService.computeDealHash()
                             keccak256(abi.encode(
                               tenantId, dealId, title,
                               value, currency, wonAt,
                               ownerId, pipelineId
                             ))
                                      │
                             BlockchainService.registerOnChain()
                             contract.registerDeal(tenantId, dealId, hash)
                                      │
                             tx.wait(1 confirmation)
                                      │
                             blockchainRepo.confirm(txHash, blockNumber)
                             (status: CONFIRMED)
```

---

## Smart Contract

**File:** `crm-backend/src/modules/blockchain/contracts/DealHashRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
```

### Functions

| Function | Access | Description |
|---|---|---|
| `registerDeal(tenantId, dealId, dataHash)` | `onlyOwner` | Register or update a deal hash |
| `verifyDeal(tenantId, dealId, dataHash)` | public view | Returns `(isValid, registeredAt, atBlock)` |
| `getDealRecord(tenantId, dealId)` | public view | Returns `(dataHash, timestamp, blockNumber)` |

### Events

```solidity
event DealRegistered(string indexed tenantId, string indexed dealId, bytes32 dataHash, uint256 timestamp);
event DealUpdated(string indexed tenantId, string indexed dealId, bytes32 oldHash, bytes32 newHash, uint256 timestamp);
```

---

## Setup & Deployment

### 1. Get an RPC endpoint

Free options:
- [Alchemy](https://alchemy.com) — Polygon Mumbai (recommended)
- [MaticVigil](https://maticvigil.com)
- [Infura](https://infura.io)

### 2. Get testnet MATIC

- [Polygon Faucet](https://faucet.polygon.technology) — request Mumbai testnet MATIC

### 3. Deploy the contract

Using Hardhat (recommended):

```bash
# In a separate hardhat project or scripts/ folder
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

npx hardhat init
# Copy DealHashRegistry.sol to contracts/
```

`scripts/deploy.ts`:
```typescript
import { ethers } from 'hardhat';

async function main() {
  const Registry = await ethers.getContractFactory('DealHashRegistry');
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  console.log('DealHashRegistry deployed to:', await registry.getAddress());
}

main().catch(console.error);
```

```bash
npx hardhat run scripts/deploy.ts --network polygon-mumbai
```

### 4. Configure environment variables

```bash
BLOCKCHAIN_RPC_URL=https://polygon-mumbai.g.alchemy.com/v2/YOUR_KEY
BLOCKCHAIN_PRIVATE_KEY=0xYOUR_WALLET_PRIVATE_KEY   # The wallet that deployed the contract
BLOCKCHAIN_CONTRACT_ADDR=0xYOUR_DEPLOYED_ADDRESS
BLOCKCHAIN_NETWORK=polygon-mumbai
```

> **Security:** Never commit `BLOCKCHAIN_PRIVATE_KEY`. Use GitHub Secrets in CI/CD and a secrets manager in production. This wallet only needs enough MATIC to pay gas — fund it minimally.

---

## API Endpoints

All blockchain endpoints are under `/blockchain`.

### Get deal's blockchain record

```
GET /blockchain/deals/:dealId
```

Response:
```json
{
  "id": "uuid",
  "dealId": "uuid",
  "tenantId": "uuid",
  "status": "CONFIRMED",
  "dataHash": "0xabc123...",
  "txHash": "0xdef456...",
  "blockNumber": 45123456,
  "network": "polygon-mumbai",
  "gasUsed": "52341",
  "createdAt": "2026-04-05T12:00:00.000Z",
  "confirmedAt": "2026-04-05T12:00:45.000Z"
}
```

### Verify deal integrity

```
GET /blockchain/deals/:dealId/verify
```

Recomputes the hash from current DB state and compares against the on-chain record.

Response:
```json
{
  "isValid": true,
  "storedHash": "0xabc123...",
  "registeredAt": "2026-04-05T12:00:45.000Z",
  "blockNumber": 45123456,
  "txHash": "0xdef456...",
  "network": "polygon-mumbai"
}
```

`isValid: false` means the deal data was modified after blockchain registration.

---

## Record Status States

| Status | Meaning |
|---|---|
| `PENDING` | Job enqueued, waiting for worker |
| `CONFIRMED` | Transaction confirmed on-chain (≥1 block) |
| `FAILED` | Transaction failed or timed out (will be retried by BullMQ) |

---

## Disabling Blockchain

The feature is **opt-in**. If `BLOCKCHAIN_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, or `BLOCKCHAIN_CONTRACT_ADDR` are missing from `.env`, the worker logs a warning and marks the record as `FAILED` gracefully. No error is thrown to the user.

---

## Production Considerations

- **Gas costs:** Each `registerDeal` call costs ~50k gas. On Polygon mainnet this is fractions of a cent.
- **Mainnet:** Change `BLOCKCHAIN_NETWORK` to `polygon` and use a Polygon Mainnet RPC.
- **Key management:** Use AWS KMS or HashiCorp Vault to store the private key — never in plaintext env vars in production.
- **Tx timeout:** The worker has a 2-minute timeout for `tx.wait()`. If the network is congested, the job will fail and BullMQ will retry with exponential back-off.
