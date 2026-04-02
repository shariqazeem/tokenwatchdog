# Token Watchdog

**The pre-trade safety firewall for AI agents on X Layer.**

Token Watchdog is a reusable OnchainOS skill that protects AI agents and humans from rug pulls — running 10-dimensional risk analysis across 7 composed skills (6 OnchainOS + Uniswap AI) and producing actionable safety scores with plain-English reasoning, on-chain transaction simulation, and risk-gated swap execution.

Built for the [OKX Build X AI Hackathon](https://web3.okx.com/xlayer/build-x-hackathon) — **Skills Arena** track.

---

## Project Introduction

Autonomous AI agents are blind to token risk. If an LLM with Agentic Wallet access is told "Buy Token X", it will happily buy a honeypot if tricked by social media sentiment. **Token Watchdog is the first Pre-Trade Safety Firewall** deployed as a composable OnchainOS skill, allowing any AI agent to natively assess 10-dimensional risk on X Layer before signing a transaction.

**One-liner:** The reusable skill that says "STOP" before your agent gets rugged.

### The Problem
- Meme tokens and new launches on X Layer are exploding
- AI agents with wallet access trade blindly — no safety layer
- Existing tools check individual signals (honeypot OR liquidity OR holders) but none combine them

### The Solution
Token Watchdog composes 7 official skills into a single atomic safety check:
1. Scan token across 10 risk dimensions in parallel (~2-3 seconds)
2. Produce a 0-100 composite risk score with plain-English reasoning
3. Simulate the transaction on-chain via `eth_call` before executing
4. Only swap if all checks pass — otherwise block with full report

---

## Architecture Overview

```
User/Agent: "Is 0xABC safe to buy 100 USDC worth?"
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│               Token Watchdog                     │
│                                                  │
│  Phase 1: Parallel Data Collection (~2s)         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │okx-      │ │okx-dex-  │ │okx-dex-  │        │
│  │security  │ │trenches  │ │token     │        │
│  │token-scan│ │dev-info  │ │advanced  │        │
│  │          │ │bundle-   │ │holders   │        │
│  │          │ │info      │ │cluster   │        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐        │
│  │okx-dex-  │ │okx-dex-  │ │okx-dex-  │        │
│  │market    │ │swap      │ │signal    │        │
│  │price-info│ │quote     │ │tracker   │        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│       └──────┬─────┘             │               │
│              ▼                   │               │
│  Phase 2: Uniswap Analysis                      │
│  ┌───────────────────────────────┐               │
│  │ Uniswap AI Skills            │               │
│  │ • DexScreener pool discovery │               │
│  │ • V4 hook bitmask decoding   │               │
│  │ • NoOp rug-pull detection    │               │
│  │ • 14 permission flag check   │               │
│  └───────────────┬───────────────┘               │
│                  ▼                                │
│  Phase 3: Risk Scoring                           │
│  ┌───────────────────────────────┐               │
│  │  Composite Risk Engine        │               │
│  │  10 weighted factors → 0-100  │               │
│  └───────────────┬───────────────┘               │
│                  ▼                                │
│  Phase 4: Transaction Simulation                 │
│  ┌───────────────────────────────┐               │
│  │  eth_call to X Layer RPC     │               │
│  │  Dry-run before real swap    │               │
│  │  Blocks if tx would revert   │               │
│  └───────────────┬───────────────┘               │
│                  ▼                                │
│  Output: DANGER (78/100)                         │
│  "Serial rugger. Top 3 wallets hold 78%.         │
│   Liquidity unlocked. DO NOT BUY."               │
│                  │                                │
│                  ▼ (if SAFE)                      │
│  ┌───────────────────────────────┐               │
│  │  Safe Swap via DEX Aggregator │               │
│  │  Gas-free on X Layer          │               │
│  └───────────────────────────────┘               │
└─────────────────────────────────────────────────┘
```

---

## Risk Dimensions (10 factors)

| Factor | Weight | Source Skill | What It Detects |
|--------|--------|-------------|-----------------|
| Honeypot Detection | 18% | okx-security | Can't-sell traps, blacklisted tokens |
| Tax Rate | 9% | okx-security + swap quote | Hidden buy/sell taxes (SafeMoon-style) |
| Holder Concentration | 13% | okx-dex-token | Top 10 wallets own too much supply |
| Developer Reputation | 13% | okx-dex-trenches | Deployer rug pull history, serial ruggers |
| Liquidity Depth | 9% | okx-dex-token + quote | Can you actually exit your position? |
| Price Manipulation | 9% | okx-dex-market | Wash trading, volume/txn ratio anomalies |
| Bundle Detection | 9% | okx-dex-trenches | Coordinated launch buying (snipers) |
| Community Verified | 5% | okx-dex-token | Listed on Top 10 CEX or community verified |
| Cluster Risk | 5% | okx-dex-token | Related wallet groups, new address % |
| **Uniswap Presence** | **10%** | **Uniswap AI Skills** | Pool existence, V4 hook permissions, NoOp risk |

---

## OnchainOS / Uniswap Skill Usage

### OnchainOS Skills (6 composed)

| Skill | Commands Used | Purpose |
|-------|--------------|---------|
| `okx-security` | `token-scan` | Honeypot detection, risk token flagging, buy/sell tax extraction |
| `okx-dex-trenches` | `token-dev-info`, `token-bundle-info` | Developer rug count, dev holdings, bundler analysis |
| `okx-dex-token` | `advanced-info`, `holders`, `cluster-overview`, `search`, `price-info`, `hot-tokens` | Holder concentration, risk tags, cluster analysis, trending discovery |
| `okx-dex-market` | `price`, `kline` | Price data, volume patterns for manipulation detection |
| `okx-dex-swap` | `quote`, `execute`, `swap` (calldata) | Price impact check, safe swap execution, tx simulation data |
| `okx-dex-signal` | `tracker activities` | Smart money/whale/KOL trading activity feed |

### Uniswap AI Skills Integration

| Feature | How It Works |
|---------|-------------|
| Pool discovery | DexScreener API queries for Uniswap v2/v3/v4 pools per token |
| Version detection | Labels array parsing to identify pool versions |
| V4 hook security | **On-chain RPC** to decode hook address permission bitmask (14 flags) |
| NoOp rug detection | Flags `BEFORE_SWAP_RETURNS_DELTA` as critical (enables NoOp rug vector) |
| Routing verification | Checks if OKX DEX aggregator routes through Uniswap for the token |
| Liquidity depth | Aggregates total Uniswap liquidity across all pools |

---

## Working Mechanics

### CLI Commands

```bash
# 1. Scan — Full 10-factor risk analysis
npx tsx src/index.ts scan <address> --chain xlayer [--json]

# 2. Search — Find tokens by name/symbol/address
npx tsx src/index.ts search <query> --chain xlayer

# 3. Safe Buy — Scan + simulate + swap (only if safe)
npx tsx src/index.ts safe-buy <address> --amount 100 --wallet <wallet> --chain xlayer

# 4. Watch — Continuous trending token monitor with caching
npx tsx src/index.ts watch --chain xlayer --interval 60
```

### Dashboard (Next.js)

| Page | Feature |
|------|---------|
| `/` (Scan) | Token address input → full risk report with gauge + 10 factor cards + Safe Buy button |
| `/trending` | 20 hot tokens with progressive risk scoring, price/volume/liquidity data |
| `/signals` | Real-time smart money and KOL trading activity feed |

### Safety Flow

1. **Risk Scan** (10 parallel checks, ~2-3 seconds)
2. **Score Gate** (score < 60 → proceed, score >= 60 → block)
3. **Transaction Simulation** (`eth_call` dry-run via X Layer RPC)
4. **Execute** (only if scan passes AND simulation succeeds)

---

## Deployment

- **Agentic Wallet:** `0x6db686fe9e983b3bcafb6c42f370fd40aff38b8e`
- **Chain:** X Layer (chainIndex: 196)
- **GitHub:** [github.com/shariqazeem/tokenwatchdog](https://github.com/shariqazeem/tokenwatchdog)
- **Moltbook:** [@tokenwatchdog](https://www.moltbook.com/u/tokenwatchdog)

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/shariqazeem/tokenwatchdog.git
cd tokenwatchdog
npm install

# Install onchainos CLI
npx skills add okx/onchainos-skills --yes

# Scan a token
npx tsx src/index.ts scan 0xfdc4a45a4bf53957b2c73b1ff323d8cbe39118dd --chain xlayer

# Run dashboard
cd dashboard && npm install && npm run dev
```

---

## For Other Agents (Composable Skill)

Token Watchdog is installable as a reusable skill:

```typescript
import { scanToken } from "token-watchdog/scanner";
import { safeSwap } from "token-watchdog/executor/swap";

// Full risk analysis
const report = await scanToken("0xTokenAddress", "xlayer");
console.log(report.overallScore); // 0-100
console.log(report.level);       // SAFE | CAUTION | WARNING | DANGER | CRITICAL
console.log(report.summary);     // Plain English explanation

// Safe swap (scan + simulate + execute, only if safe)
const result = await safeSwap({
  fromToken: "0x74b7...", // USDC on X Layer
  toToken: "0xTokenAddress",
  amount: "100",
  chain: "xlayer",
  wallet: "0xYourWallet",
  maxRiskScore: 60,
});
```

---

## Project Positioning in X Layer Ecosystem

Token Watchdog fills a critical gap: **there is no safety layer between AI agents and on-chain trading on X Layer**. As agentic wallets proliferate and gas-free transactions make X Layer the ideal chain for AI agents, the attack surface for rugs and scams grows proportionally.

Token Watchdog positions itself as:
- The **default pre-trade check** for every agent operating on X Layer
- A **composable skill** that other OnchainOS skills can call before any swap
- The **data analyst** that turns raw on-chain signals into actionable risk decisions
- A **Uniswap integration showcase** with deep V4 hook security analysis

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Core engine | Node.js + TypeScript |
| OnchainOS | `onchainos` CLI v2.2.5 (7 skills composed) |
| Uniswap | DexScreener API + on-chain V4 hook RPC queries |
| Dashboard | Next.js 16 + Tailwind CSS |
| Chain | X Layer (196) — gas-free stablecoins |
| Wallet | OKX Agentic Wallet (TEE-secured) |
| Simulation | `eth_call` via X Layer RPC |

## Project Structure

```
tokenwatchdog/
├── src/
│   ├── index.ts              # CLI: scan, search, safe-buy, watch
│   ├── scanner/
│   │   ├── index.ts          # Orchestrator (parallel Phase 1 + Phase 2)
│   │   ├── security.ts       # okx-security token-scan
│   │   ├── trenches.ts       # Dev reputation + bundle detection
│   │   ├── token.ts          # Advanced info, holders, clusters
│   │   ├── market.ts         # Price, volume, quotes
│   │   └── uniswap.ts        # Uniswap pool discovery + V4 hook analysis
│   ├── scoring/
│   │   └── engine.ts         # 10-factor weighted risk scoring
│   ├── executor/
│   │   ├── swap.ts           # Safe swap (risk-gated + simulated)
│   │   └── simulate.ts       # eth_call transaction simulation
│   └── utils/
│       ├── cli.ts            # onchainos CLI wrapper
│       └── types.ts          # TypeScript interfaces
├── dashboard/                 # Next.js dashboard
│   └── src/app/
│       ├── page.tsx          # Scan + Safe Buy UI
│       ├── trending/         # 20 tokens + progressive risk scores
│       └── signals/          # Smart money / KOL feed
├── skill/
│   ├── SKILL.md              # Reusable skill definition (487 lines)
│   ├── metadata.json         # Skill metadata
│   └── install.sh            # Installation script
├── package.json
└── README.md
```

## Team

- **Shariq** — Solo developer

## License

MIT
