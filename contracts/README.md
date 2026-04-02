# WatchdogGuard -- On-Chain Swap Firewall

WatchdogGuard is a smart contract that acts as an on-chain firewall between AI agents and DEX routers. Every swap must include a signed safety attestation from Token Watchdog; without it, the transaction reverts.

## How It Works

```
Agent                  Token Watchdog (off-chain)        WatchdogGuard (on-chain)        DEX Router
  |                              |                               |                           |
  |  1. "I want to swap to X"   |                               |                           |
  |----------------------------->|                               |                           |
  |                              |                               |                           |
  |  2. Scan token X             |                               |                           |
  |  - Liquidity analysis        |                               |                           |
  |  - Holder concentration      |                               |                           |
  |  - Honeypot detection        |                               |                           |
  |  - Dev wallet tracking       |                               |                           |
  |                              |                               |                           |
  |  3. Return risk score + sign |                               |                           |
  |     attestation off-chain    |                               |                           |
  |<-----------------------------|                               |                           |
  |                              |                               |                           |
  |  4. Submit guardedSwap(router, swapData, token, attestation) |                           |
  |------------------------------------------------------------->|                           |
  |                              |                               |                           |
  |                              |            5. Verify:         |                           |
  |                              |            - Signature valid?  |                           |
  |                              |            - Signer matches?   |                           |
  |                              |            - Risk < max?       |                           |
  |                              |            - Not expired?      |                           |
  |                              |            - Token matches?    |                           |
  |                              |                               |                           |
  |                              |            6. All checks pass  |                           |
  |                              |               Forward call --->|  7. Execute swap          |
  |                              |                               |-------------------------->|
  |                              |                               |                           |
  |                              |                               |  8. Swap result           |
  |<--------------------------------------------------------------|<--------------------------|
```

## Step-by-Step Flow

### 1. Agent wants to swap Token X

The AI agent (or any user) decides to buy/sell a token via a DEX. Instead of calling the router directly, the agent **must** route through WatchdogGuard.

### 2. Agent calls Token Watchdog scan

```bash
token-watchdog scan <token-address> --chain xlayer --json
```

This returns a `RiskReport` with an `overallScore` (0-100, higher = riskier).

### 3. Token Watchdog signs an attestation (off-chain)

Using the attestation module (`src/guardian/attestation.ts`):

```typescript
import { createAttestation } from "./src/guardian/attestation.js";

const attestation = createAttestation(
  "0x<token-address>",  // token being swapped to
  riskReport.overallScore,  // risk score from scan
  196,                      // chainId (X Layer)
  300                       // valid for 5 minutes
);
```

This produces:
- A message hash: `keccak256(abi.encodePacked(token, riskScore, expiry, chainId))`
- An EIP-191 signature from the Watchdog signer key
- ABI-encoded attestation bytes ready for on-chain submission

### 4. Agent submits swap through WatchdogGuard

The agent calls `WatchdogGuard.guardedSwap()` with:
- `router` -- the DEX router address
- `swapData` -- the encoded swap calldata (same as what you would send to the router directly)
- `token` -- address of the token being swapped to
- `attestation` -- the signed bytes from step 3

### 5. Contract verifies everything on-chain

The contract checks:
- **Signature validity** -- `ecrecover` confirms the attestation was signed by the authorized Watchdog signer
- **Risk score** -- `riskScore < maxRiskScore` (default: 60)
- **Expiry** -- `expiry > block.timestamp` (attestation has not expired)
- **Token match** -- the attested token matches what is actually being swapped

If any check fails, the transaction **reverts** with a descriptive error and emits a `SwapBlocked` event.

### 6. Swap executes

If all checks pass, the contract:
- Emits `SwapGuarded(token, riskScore, agent)`
- Forwards the call to the DEX router: `router.call{value: msg.value}(swapData)`

## Contract Details

| Property | Value |
|----------|-------|
| Chain | X Layer (chainId 196) |
| Solidity | ^0.8.20 |
| Signature scheme | EIP-191 personal sign + ecrecover |
| Default max risk | 60 |
| Agentic Wallet | `0x6db686fe9e983b3bcafb6c42f370fd40aff38b8e` |

### Admin Functions

| Function | Access | Description |
|----------|--------|-------------|
| `setSigner(address)` | owner | Update the Watchdog attestation signer key |
| `setMaxRiskScore(uint256)` | owner | Adjust the risk threshold |
| `transferOwnership(address)` | owner | Transfer contract ownership |

### Events

| Event | When |
|-------|------|
| `SwapGuarded(token, riskScore, agent)` | Swap approved and forwarded |
| `SwapBlocked(token, riskScore, reason)` | Swap rejected (+ revert) |
| `SignerUpdated(old, new)` | Signer key changed |
| `MaxRiskScoreUpdated(old, new)` | Risk threshold changed |

## Deployment

### Compile

```bash
solc --bin --abi --optimize --optimize-runs 200 contracts/WatchdogGuard.sol -o contracts/
mv contracts/WatchdogGuard.bin contracts/  # if output name differs
```

### Deploy

```bash
DEPLOYER_KEY=0x<private-key> \
WATCHDOG_SIGNER_ADDR=0x<signer-public-address> \
MAX_RISK_SCORE=60 \
npx tsx contracts/deploy.ts
```

The script:
1. Derives the deployer address from the private key
2. ABI-encodes the constructor arguments (signer address + max risk score)
3. Estimates gas and submits a legacy transaction to X Layer
4. Waits for confirmation
5. Saves the contract address to `contracts/deployment.json`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WATCHDOG_SIGNER_KEY` | Yes (attestation) | Hex private key for signing attestations |
| `DEPLOYER_KEY` | Yes (deploy) | Hex private key for contract deployment |
| `WATCHDOG_SIGNER_ADDR` | Yes (deploy) | Public address of the attestation signer |
| `XLAYER_RPC` | No | RPC URL (default: `https://rpc.xlayer.tech`) |
| `MAX_RISK_SCORE` | No | Risk threshold (default: 60) |

## Security Notes

- The signer key should be kept in a secure enclave or HSM in production.
- Attestations expire after 5 minutes by default to prevent replay attacks.
- The contract uses EIP-2 signature malleability protection (s-value normalization).
- The `maxRiskScore` can be adjusted without redeploying the contract.
- Only the contract owner can change the signer or risk threshold.
