---
name: token-watchdog
version: 1.0.0
description: "Reusable OnchainOS skill that protects agents and humans from rug pulls on X Layer — composite risk analysis across 9 dimensions + safe Uniswap/DEX swap execution. Use when: checking if a token is safe, analyzing token risk, scanning for rugs, safe-buying tokens, finding safe trending tokens."
author: tokenwatchdog
homepage: https://github.com/user/tokenwatchdog
metadata: {"category": ["Skill Arena"], "chain": "X Layer (196)", "composedSkills": ["okx-security", "okx-dex-trenches", "okx-dex-token", "okx-dex-market", "okx-dex-swap", "okx-dex-signal"]}
---

# Token Watchdog

> The safety layer every agent needs before trading on X Layer.

Token Watchdog is a **composable OnchainOS skill** that runs 9-dimensional risk analysis on any token and produces a composite safety score (0–100) with plain-English reasoning and actionable recommendations — including safe swap execution via Uniswap/DEX aggregator.

## What It Does

1. **Full Risk Scan**: Analyzes a token across 9 weighted dimensions in parallel
2. **Composite Score**: Produces a 0–100 risk score (higher = more dangerous) with a risk level (SAFE/CAUTION/WARNING/DANGER/CRITICAL)
3. **Plain-English Report**: Explains exactly WHY a token is risky in human-readable language
4. **Safe Execution**: Only executes trades when tokens pass the safety threshold
5. **Watch Mode**: Continuously scans trending tokens and alerts on safe opportunities

## Risk Dimensions (9 factors, weighted)

| Factor | Weight | Source Skill | What It Detects |
|--------|--------|-------------|-----------------|
| Honeypot Detection | 20% | okx-security | Can you sell? Hidden traps |
| Tax Rate | 10% | okx-security + quote | Hidden buy/sell taxes |
| Holder Concentration | 15% | okx-dex-token | Top wallets own too much supply |
| Developer Reputation | 15% | okx-dex-trenches | Deployer rug pull history |
| Liquidity Depth | 10% | okx-dex-token + quote | Can you actually exit? |
| Price Manipulation | 10% | okx-dex-market | Wash trading, volume anomalies |
| Bundle Detection | 10% | okx-dex-trenches | Coordinated launch buying |
| Community Verified | 5% | okx-dex-token | Listed on major exchanges? |
| Cluster Risk | 5% | okx-dex-token | Related wallet concentration |

## Commands

### Scan a Token

Run a full 9-dimensional risk analysis:

```bash
token-watchdog scan <token-address> --chain xlayer
```

Options:
- `--chain <chain>` — Chain name or ID (default: xlayer). Supports: xlayer, ethereum, solana, bsc, base, arbitrum, etc.
- `--json` — Output as JSON for programmatic use

**Output example:**
```
╔══════════════════════════════════════════════════════════════╗
║  TOKEN WATCHDOG REPORT                                      ║
╠══════════════════════════════════════════════════════════════╣
║  Token:  SCAM (ScamToken)
║  Chain:  xlayer
║  Address: 0xabc123...
╠══════════════════════════════════════════════════════════════╣
║  Risk Level: DANGER
║  Score:      ████████████░░░░░░░░ 62/100
╠══════════════════════════════════════════════════════════════╣
║  RISK FACTORS:
║  🔴 Honeypot Detection          0/100 (w:20%) → +0
║     No honeypot indicators detected
║  🟢 Tax Rate                    0/100 (w:10%) → +0
║     No significant buy/sell tax detected
║  🔴 Holder Concentration       95/100 (w:15%) → +14
║     Top 10 wallets hold 82.3% of supply — extreme concentration
║  🔴 Developer Reputation      100/100 (w:15%) → +15
║     SERIAL RUGGER: 11/14 tokens rugged (79% rug rate)
║  ...
╠══════════════════════════════════════════════════════════════╣
║  DANGER (62/100): SCAM has serious red flags. DO NOT BUY.
╚══════════════════════════════════════════════════════════════╝
```

Exit codes: `0` = safe (<60), `1` = dangerous (≥60), `2` = scan error.

### Search Tokens

```bash
token-watchdog search <query> --chain xlayer
```

Searches by name, symbol, or contract address.

### Safe Buy

Buy a token ONLY if it passes the safety threshold:

```bash
token-watchdog safe-buy <token-address> --amount 100 --chain xlayer --wallet <your-wallet>
```

Options:
- `--amount <usdc>` — Amount in USDC to spend (default: 100)
- `--wallet <address>` — Your Agentic Wallet address (required)
- `--threshold <0-100>` — Maximum risk score to allow (default: 60)
- `--chain <chain>` — Target chain (default: xlayer)

The swap only executes if the token's risk score is below the threshold. Gas-free on X Layer via Agentic Wallet.

### Watch Mode

Continuously scan trending tokens and alert on safe ones:

```bash
token-watchdog watch --chain xlayer --interval 60 --threshold 40
```

Output:
```
👁  Token Watchdog — Watch Mode
   Chain: xlayer | Interval: 60s | Safe threshold: <40

[14:30:01] ✅ WETH — Score: 8/100 (SAFE)
   → SAFE: WETH passes safety checks. No major red flags detected.
[14:30:03] 🚫 RUGCOIN — Score: 92/100 (CRITICAL)
[14:30:05] ⚠️ NEWTOKEN — Score: 45/100 (WARNING)
```

## Integration

### As a CLI tool
```bash
npx tsx src/index.ts scan 0xTokenAddress --chain xlayer --json
```

### As a library (for other agents/skills)
```typescript
import { scanToken } from "token-watchdog/scanner";
import { safeSwap } from "token-watchdog/executor/swap";

// Full risk analysis
const report = await scanToken("0xTokenAddress", "xlayer");
console.log(report.overallScore); // 0-100
console.log(report.level);       // "SAFE" | "DANGER" | etc.
console.log(report.summary);     // Plain English explanation

// Safe swap (only executes if safe)
const result = await safeSwap({
  fromToken: "0x74b7...", // USDC on X Layer
  toToken: "0xTokenAddress",
  amount: "100",
  chain: "xlayer",
  wallet: "0xYourWallet",
  maxRiskScore: 60,
});
```

### As an MCP tool (for AI agents)

Other agents can call Token Watchdog as a tool:

**Input:** Token address + chain
**Output:** Risk score, level, factors, recommendation

This makes Token Watchdog a composable safety layer — any agent that trades can check Token Watchdog first.

## OnchainOS Skills Composed

Token Watchdog is built by composing these official OnchainOS skills:

1. **okx-security** — `token-scan` for honeypot/risk detection
2. **okx-dex-trenches** — `token-dev-info` + `token-bundle-info` for developer reputation and bundle detection
3. **okx-dex-token** — `advanced-info` + `holders` + `cluster-overview` for holder analysis and risk tagging
4. **okx-dex-market** — `price-info` for volume, liquidity, and price manipulation detection
5. **okx-dex-swap** — `quote` for price impact + `execute` for safe swap execution
6. **okx-dex-signal** — Smart money/whale activity tracking (watch mode)

## Architecture

```
User/Agent: "Is 0xABC safe to buy?"
        │
        ▼
┌─────────────────────────────────────────────┐
│            Token Watchdog                    │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Security │ │ Trenches │ │  Token   │    │
│  │ Scanner  │ │ Scanner  │ │ Scanner  │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘    │
│       │             │            │           │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐    │
│  │ Market   │ │  Quote   │ │ Signal   │    │
│  │ Scanner  │ │ Scanner  │ │ Scanner  │    │
│  └────┬─────┘ └────┬─────┘ └────┴─────┘    │
│       │             │            │           │
│       ▼             ▼            ▼           │
│  ┌─────────────────────────────────────┐    │
│  │    Composite Risk Scoring Engine    │    │
│  │    (9 weighted factors → 0-100)     │    │
│  └──────────────┬──────────────────────┘    │
│                 │                            │
│                 ▼                            │
│  ┌─────────────────────────────────────┐    │
│  │  Risk Report + Recommendation       │    │
│  │  DANGER (78/100): Serial rugger...  │    │
│  └──────────────┬──────────────────────┘    │
│                 │                            │
│                 ▼ (if safe)                  │
│  ┌─────────────────────────────────────┐    │
│  │  Safe Swap Executor                 │    │
│  │  → okx-dex-swap on X Layer         │    │
│  │  → Gas-free via Agentic Wallet     │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## Requirements

- Node.js 18+
- `onchainos` CLI binary (installed via OnchainOS skills)
- OnchainOS API key (from Dev Portal)
- Agentic Wallet (for swap execution)
