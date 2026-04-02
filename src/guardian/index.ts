/**
 * Token Watchdog — Autonomous Portfolio Guardian
 *
 * Combines portfolio monitoring + reactive panic selling into
 * a single autonomous agent that protects your wallet 24/7.
 *
 * Usage:
 *   const guardian = new PortfolioGuardian({ walletAddress: "0x...", chain: "xlayer" });
 *   await guardian.start();
 */

import { PortfolioMonitor, getPortfolioHoldings } from "./monitor.js";
import { PanicSellHandler } from "./panic-sell.js";
import type { RiskSpikeEvent, MonitoredToken } from "./monitor.js";
import type { PanicSellResult } from "./panic-sell.js";

export interface GuardianConfig {
  walletAddress: string;
  chain: string;
  scanIntervalMs: number;
  spikeThreshold: number;
  panicSellThreshold: number;
  panicSellEnabled: boolean;
  dryRun: boolean;
  maxSlippagePercent: string;
}

export interface GuardianState {
  running: boolean;
  walletAddress: string;
  chain: string;
  tokens: MonitoredToken[];
  events: RiskSpikeEvent[];
  panicSellHistory: PanicSellResult[];
  stats: {
    totalScans: number;
    spikesDetected: number;
    panicSellsTriggered: number;
    panicSellsExecuted: number;
    totalValueProtected: number;
  };
}

const DEFAULT_GUARDIAN_CONFIG: Partial<GuardianConfig> = {
  chain: "xlayer",
  scanIntervalMs: 60_000,
  spikeThreshold: 20,
  panicSellThreshold: 70,
  panicSellEnabled: true,
  dryRun: true, // Default to dry run for safety
  maxSlippagePercent: "5",
};

export class PortfolioGuardian {
  private config: GuardianConfig;
  private monitor: PortfolioMonitor;
  private panicHandler: PanicSellHandler;
  private running = false;
  private stats = {
    totalScans: 0,
    spikesDetected: 0,
    panicSellsTriggered: 0,
    panicSellsExecuted: 0,
    totalValueProtected: 0,
  };

  constructor(config: Partial<GuardianConfig> & { walletAddress: string }) {
    this.config = { ...DEFAULT_GUARDIAN_CONFIG, ...config } as GuardianConfig;

    // Initialize panic sell handler
    this.panicHandler = new PanicSellHandler({
      walletAddress: this.config.walletAddress,
      chain: this.config.chain,
      enabled: this.config.panicSellEnabled,
      dryRun: this.config.dryRun,
      maxSlippagePercent: this.config.maxSlippagePercent,
    });

    // Initialize monitor with spike callback
    this.monitor = new PortfolioMonitor({
      walletAddress: this.config.walletAddress,
      chain: this.config.chain,
      scanIntervalMs: this.config.scanIntervalMs,
      spikeThreshold: this.config.spikeThreshold,
      panicSellThreshold: this.config.panicSellThreshold,
      onSpikeDetected: (event) => this.handleSpike(event),
    });
  }

  /** Start the autonomous guardian */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  🛡️  TOKEN WATCHDOG — AUTONOMOUS PORTFOLIO GUARDIAN          ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║  Wallet:       ${this.config.walletAddress}`);
    console.log(`║  Chain:        ${this.config.chain}`);
    console.log(`║  Panic Sell:   ${this.config.panicSellEnabled ? (this.config.dryRun ? "DRY RUN" : "LIVE") : "DISABLED"}`);
    console.log(`║  Spike Alert:  +${this.config.spikeThreshold} points`);
    console.log(`║  Panic Trigger: ${this.config.panicSellThreshold}/100`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    await this.monitor.start();
  }

  /** Stop the guardian */
  stop(): void {
    this.running = false;
    this.monitor.stop();
    console.log("\n🛡️ Guardian stopped.");
  }

  /** Get full guardian state (for API/dashboard) */
  getState(): GuardianState {
    const monitorState = this.monitor.getState();
    return {
      running: this.running,
      walletAddress: this.config.walletAddress,
      chain: this.config.chain,
      tokens: monitorState.tokens,
      events: monitorState.events,
      panicSellHistory: this.panicHandler.getHistory(),
      stats: { ...this.stats },
    };
  }

  /** Handle a risk spike from the monitor */
  private async handleSpike(event: RiskSpikeEvent): Promise<void> {
    this.stats.spikesDetected++;

    if (event.action === "PANIC_SELL") {
      this.stats.panicSellsTriggered++;
      const result = await this.panicHandler.handleSpike(event);

      if (result.action === "SOLD" || result.action === "SIMULATED") {
        this.stats.panicSellsExecuted++;
        this.stats.totalValueProtected += parseFloat(event.token.balanceUsd || "0");
      }
    }
  }
}

/** One-shot portfolio scan (non-continuous) — for the API */
export async function scanPortfolio(
  walletAddress: string,
  chain: string
): Promise<{
  holdings: Array<{
    tokenContractAddress: string;
    tokenSymbol: string;
    tokenName: string;
    balance: string;
    balanceUsd: string;
    riskScore: number | null;
    riskLevel: string;
    riskSummary: string;
  }>;
  totalValueUsd: number;
  dangerCount: number;
  safeCount: number;
}> {
  const { scanToken } = await import("../scanner/index.js");
  const holdings = await getPortfolioHoldings(walletAddress, chain);

  const scanned = await Promise.all(
    holdings.map(async (h) => {
      try {
        const report = await scanToken(h.tokenContractAddress, h.chain);
        return {
          ...h,
          riskScore: report.overallScore,
          riskLevel: report.level,
          riskSummary: report.summary,
        };
      } catch {
        return { ...h, riskScore: null, riskLevel: "UNKNOWN", riskSummary: "" };
      }
    })
  );

  const totalValueUsd = scanned.reduce((s, h) => s + parseFloat(h.balanceUsd || "0"), 0);
  const dangerCount = scanned.filter((h) => (h.riskScore ?? 0) >= 60).length;
  const safeCount = scanned.filter((h) => h.riskScore !== null && h.riskScore < 60).length;

  return { holdings: scanned, totalValueUsd, dangerCount, safeCount };
}

// Re-export types
export type { RiskSpikeEvent, MonitoredToken, TokenHolding } from "./monitor.js";
export type { PanicSellResult } from "./panic-sell.js";
