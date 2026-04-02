# Token Watchdog

**The safety layer every agent needs before trading on X Layer.**

Token Watchdog is a reusable OnchainOS skill that protects AI agents and humans from rug pulls — running 9-dimensional risk analysis across 6 composed skills and producing actionable safety scores with plain-English reasoning.

Built for the [OKX Build X AI Hackathon](https://www.moltbook.com/m/buildx) — Skills Arena track.

## How It Works

```
User/Agent: "Is 0xABC safe to buy?"
                    │
                    ▼
    ┌───────────────────────────────────┐
    │         Token Watchdog            │
    │                                   │
    │   ┌─────────┐  ┌──────────┐      │
    │   │Security │  │ Trenches │      │
    │   │  Scan   │  │ Dev Rep  │      │
    │   └────┬────┘  └────┬─────┘      │
    │   ┌────┴────┐  ┌────┴─────┐      │
    │   │ Token   │  │  Market  │      │
    │   │Advanced │  │  Data    │      │
    │   └────┬────┘  └────┬─────┘      │
    │   ┌────┴────┐  ┌────┴─────┐      │
    │   │  Quote  │  │ Uniswap  │      │
    │   │ Check   │  │ Pools    │      │
    │   └────┬────┘  └────┬─────┘      │
    │        └──────┬─────┘            │
    │               ▼                   │
    │   ┌───────────────────────┐      │
    │   │  Risk Scoring Engine  │      │
    │   │  9 factors → 0-100   │      │
    │   └───────────┬───────────┘      │
    │               ▼                   │
    │   DANGER (78/100)                │
    │   "Serial rugger. Top 3          │
    │    wallets hold 78%.             │
    │    DO NOT BUY."                  │
    │               │                   │
    │               ▼ (if safe)        │
    │   ┌───────────────────────┐      │
    │   │  Safe Swap Executor   │      │
    │   │  Uniswap / DEX Agg   │      │
    │   │  Gas-free on X Layer  │      │
    │   └───────────────────────┘      │
    └───────────────────────────────────┘
```

## Risk Dimensions

| Factor | Weight | What It Detects |
|--------|--------|-----------------|
| Honeypot Detection | 20% | Can't sell traps |
| Tax Rate | 10% | Hidden buy/sell taxes |
| Holder Concentration | 15% | Whale dominance |
| Developer Reputation | 15% | Deployer rug history |
| Liquidity Depth | 10% | Exit liquidity |
| Price Manipulation | 10% | Wash trading, volume anomalies |
| Bundle Detection | 10% | Coordinated launch buys |
| Community Verified | 5% | Exchange-listed? |
| Cluster Risk | 5% | Related wallet groups |

## Quick Start

```bash
# Install dependencies
npm install

# Scan a token
npx tsx src/index.ts scan 0xfdc4a45a4bf53957b2c73b1ff323d8cbe39118dd --chain xlayer

# Search tokens
npx tsx src/index.ts search OKB --chain xlayer

# Safe buy (only executes if safe)
npx tsx src/index.ts safe-buy 0xTOKEN --amount 100 --wallet 0xYOUR_WALLET --chain xlayer

# Watch mode (continuous scanning)
npx tsx src/index.ts watch --chain xlayer --interval 60
```

## Dashboard

```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:3000
```

Features:
- **Scan** — Paste any token address for full 9-factor analysis
- **Trending** — Hot tokens on X Layer with live risk scores
- **Smart Money** — Real-time whale and KOL trading activity

## OnchainOS Skills Composed

Token Watchdog composes 6 official OnchainOS skills:

| Skill | Usage |
|-------|-------|
| `okx-security` | Honeypot detection, risk token flagging |
| `okx-dex-trenches` | Developer reputation, bundle/sniper analysis |
| `okx-dex-token` | Holder concentration, cluster analysis, advanced risk tags |
| `okx-dex-market` | Price data, volume patterns, manipulation detection |
| `okx-dex-swap` | Quote for price impact, safe swap execution |
| `okx-dex-signal` | Smart money and whale activity tracking |

Plus **Uniswap AI Skills** for pool analysis and swap routing on X Layer.

## For Other Agents

Token Watchdog is designed as a composable skill. Other agents can:

```typescript
import { scanToken } from "token-watchdog/scanner";

const report = await scanToken("0xTokenAddress", "xlayer");
if (report.overallScore < 60) {
  // Safe to trade
} else {
  // Block the trade
  console.log(report.summary); // "DANGER: Serial rugger..."
}
```

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **OnchainOS:** `onchainos` CLI v2.2.5
- **Dashboard:** Next.js 16 + Tailwind CSS
- **Chain:** X Layer (chain 196) — gas-free stablecoin transfers
- **Wallet:** OKX Agentic Wallet (TEE-secured)

## Project Structure

```
tokenwatchdog/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── scanner/
│   │   ├── index.ts          # Orchestrator (parallel scans)
│   │   ├── security.ts       # okx-security wrapper
│   │   ├── trenches.ts       # Dev rep + bundle detection
│   │   ├── token.ts          # Advanced info, holders, clusters
│   │   ├── market.ts         # Price, volume, quotes
│   │   └── uniswap.ts        # Uniswap pool analysis
│   ├── scoring/
│   │   └── engine.ts         # 9-factor weighted scoring
│   ├── executor/
│   │   └── swap.ts           # Safe swap (risk-gated)
│   └── utils/
│       ├── cli.ts            # onchainos CLI wrapper
│       └── types.ts          # TypeScript interfaces
├── dashboard/                 # Next.js dashboard
│   └── src/app/
│       ├── page.tsx          # Scan page
│       ├── trending/         # Trending tokens
│       └── signals/          # Smart money feed
├── skill/
│   └── SKILL.md              # Reusable skill definition
└── package.json
```

## Hackathon

- **Track:** Skills Arena
- **Agentic Wallet:** `0x6db686fe9e983b3bcafb6c42f370fd40aff38b8e`
- **Moltbook:** [@tokenwatchdog](https://www.moltbook.com/u/tokenwatchdog)
- **GitHub:** [shariqazeem/tokenwatchdog](https://github.com/shariqazeem/tokenwatchdog)

## License

MIT
