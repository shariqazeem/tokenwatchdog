/**
 * Reactive Panic Sell System
 *
 * When the portfolio monitor detects a risk spike above the panic threshold,
 * this module automatically sells the dangerous token back to USDC via
 * the Agentic Wallet — before the liquidity drains.
 */

import { runJson, run, resolveChain } from "../utils/cli.js";
import { simulateTransaction, getSwapCalldata } from "../executor/simulate.js";
import type { RiskSpikeEvent } from "./monitor.js";

// ── Types ──

export interface PanicSellConfig {
  walletAddress: string;
  chain: string;
  enabled: boolean;
  maxSlippagePercent: string;  // e.g., "5" for 5%
  cooldownMs: number;          // Minimum time between sells for same token
  dryRun: boolean;             // If true, simulates but doesn't execute
}

export interface PanicSellResult {
  token: string;
  symbol: string;
  action: "SOLD" | "SIMULATED" | "BLOCKED" | "FAILED" | "COOLDOWN";
  txHash?: string;
  amountSold?: string;
  amountReceived?: string;
  reason: string;
  timestamp: number;
}

const DEFAULT_CONFIG: PanicSellConfig = {
  walletAddress: "",
  chain: "xlayer",
  enabled: true,
  maxSlippagePercent: "5",
  cooldownMs: 5 * 60 * 1000, // 5 minute cooldown per token
  dryRun: false,
};

// USDC addresses per chain
const USDC_MAP: Record<string, string> = {
  "196": "0x74b7f16337b8972027f6196a17a631ac6de26d22",
  "1":   "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "8453":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "56":  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
};

// ── Panic Sell Handler ──

export class PanicSellHandler {
  private config: PanicSellConfig;
  private cooldowns: Map<string, number> = new Map();
  private results: PanicSellResult[] = [];

  constructor(config: Partial<PanicSellConfig> & { walletAddress: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Get history of panic sell actions */
  getHistory(): PanicSellResult[] {
    return [...this.results];
  }

  /** Handle a risk spike event from the monitor */
  async handleSpike(event: RiskSpikeEvent): Promise<PanicSellResult> {
    const { token, currentScore, report } = event;
    const key = `${token.chain}:${token.tokenContractAddress}`;
    const now = Date.now();

    // Check cooldown
    const lastSell = this.cooldowns.get(key);
    if (lastSell && now - lastSell < this.config.cooldownMs) {
      const result: PanicSellResult = {
        token: token.tokenContractAddress,
        symbol: token.tokenSymbol,
        action: "COOLDOWN",
        reason: `Cooldown active — last sell was ${Math.round((now - lastSell) / 1000)}s ago`,
        timestamp: now,
      };
      this.results.push(result);
      return result;
    }

    // Only panic sell on PANIC_SELL action
    if (event.action !== "PANIC_SELL") {
      const result: PanicSellResult = {
        token: token.tokenContractAddress,
        symbol: token.tokenSymbol,
        action: "BLOCKED",
        reason: `Score ${currentScore}/100 below panic threshold — monitoring only`,
        timestamp: now,
      };
      this.results.push(result);
      return result;
    }

    if (!this.config.enabled) {
      const result: PanicSellResult = {
        token: token.tokenContractAddress,
        symbol: token.tokenSymbol,
        action: "BLOCKED",
        reason: "Panic sell is disabled",
        timestamp: now,
      };
      this.results.push(result);
      return result;
    }

    const chainId = resolveChain(this.config.chain);
    const usdcAddress = USDC_MAP[chainId];
    if (!usdcAddress) {
      const result: PanicSellResult = {
        token: token.tokenContractAddress,
        symbol: token.tokenSymbol,
        action: "FAILED",
        reason: `No USDC address configured for chain ${chainId}`,
        timestamp: now,
      };
      this.results.push(result);
      return result;
    }

    console.log(`\n🔴 PANIC SELL: ${token.tokenSymbol} (Score: ${currentScore}/100)`);
    console.log(`   Reason: ${report.summary}`);
    console.log(`   Balance: $${token.balanceUsd}`);

    // Dry run mode — simulate only
    if (this.config.dryRun) {
      console.log(`   Mode: DRY RUN — simulating only, not executing`);

      try {
        const calldata = await getSwapCalldata(
          token.tokenContractAddress,
          usdcAddress,
          token.balance,
          this.config.chain,
          this.config.walletAddress,
          this.config.maxSlippagePercent,
        );

        const sim = await simulateTransaction(calldata, this.config.walletAddress);

        const result: PanicSellResult = {
          token: token.tokenContractAddress,
          symbol: token.tokenSymbol,
          action: "SIMULATED",
          reason: sim.success
            ? `Simulation passed — would sell $${token.balanceUsd} of ${token.tokenSymbol}`
            : `Simulation failed: ${sim.revertReason}`,
          timestamp: now,
        };
        this.results.push(result);
        console.log(`   Result: ${result.reason}`);
        return result;
      } catch (err) {
        const result: PanicSellResult = {
          token: token.tokenContractAddress,
          symbol: token.tokenSymbol,
          action: "FAILED",
          reason: `Simulation error: ${err}`,
          timestamp: now,
        };
        this.results.push(result);
        return result;
      }
    }

    // Live execution — sell the token
    try {
      console.log(`   Executing panic sell via Agentic Wallet...`);

      const swapResult = await runJson<any>([
        "swap", "execute",
        "--from", token.tokenContractAddress,
        "--to", usdcAddress,
        "--readable-amount", token.balance,
        "--chain", this.config.chain,
        "--wallet", this.config.walletAddress,
        "--slippage", this.config.maxSlippagePercent,
      ], 60_000);

      const data = swapResult?.data ?? swapResult;
      this.cooldowns.set(key, now);

      const result: PanicSellResult = {
        token: token.tokenContractAddress,
        symbol: token.tokenSymbol,
        action: "SOLD",
        txHash: data?.swapTxHash ?? data?.txHash ?? "",
        amountSold: token.balance,
        amountReceived: data?.toAmount ?? "",
        reason: `Emergency sold ${token.tokenSymbol} — risk score spiked to ${currentScore}/100`,
        timestamp: now,
      };

      this.results.push(result);
      console.log(`   ✅ SOLD! TX: ${result.txHash}`);
      console.log(`   Amount: ${token.balance} ${token.tokenSymbol} → USDC`);
      return result;
    } catch (err) {
      const result: PanicSellResult = {
        token: token.tokenContractAddress,
        symbol: token.tokenSymbol,
        action: "FAILED",
        reason: `Swap execution failed: ${err}`,
        timestamp: now,
      };
      this.results.push(result);
      console.error(`   ❌ Panic sell failed:`, err);
      return result;
    }
  }
}
