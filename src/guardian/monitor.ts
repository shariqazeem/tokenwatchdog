/**
 * Portfolio Monitor Engine
 *
 * Continuously watches all tokens in a wallet, re-scans periodically,
 * detects risk score spikes, and triggers panic sell when thresholds are breached.
 */

import { runJson } from "../utils/cli.js";
import { scanToken } from "../scanner/index.js";
import { resolveChain } from "../utils/cli.js";
import type { RiskReport } from "../utils/types.js";

// ── Types ──

export interface TokenHolding {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  balance: string;
  balanceUsd: string;
  chain: string;
}

export interface MonitoredToken {
  holding: TokenHolding;
  lastScan: RiskReport | null;
  previousScore: number;
  currentScore: number;
  scoreHistory: { score: number; timestamp: number }[];
  spikeDetected: boolean;
  lastScanTime: number;
}

export interface RiskSpikeEvent {
  token: TokenHolding;
  previousScore: number;
  currentScore: number;
  scoreDelta: number;
  report: RiskReport;
  timestamp: number;
  action: "ALERT" | "PANIC_SELL" | "WATCH";
}

export interface MonitorConfig {
  walletAddress: string;
  chain: string;
  scanIntervalMs: number;       // How often to re-scan each token (default: 60s)
  spikeThreshold: number;       // Score increase that triggers alert (default: 20)
  panicSellThreshold: number;   // Absolute score that triggers panic sell (default: 70)
  maxConcurrentScans: number;   // Parallel scan limit (default: 3)
  onSpikeDetected?: (event: RiskSpikeEvent) => void | Promise<void>;
}

const DEFAULT_CONFIG: Partial<MonitorConfig> = {
  chain: "xlayer",
  scanIntervalMs: 60_000,
  spikeThreshold: 20,
  panicSellThreshold: 70,
  maxConcurrentScans: 3,
};

// ── Portfolio Fetcher ──

export async function getPortfolioHoldings(
  walletAddress: string,
  chain: string
): Promise<TokenHolding[]> {
  const chainId = resolveChain(chain);

  try {
    const raw = await runJson<any>([
      "portfolio", "all-balances",
      "--address", walletAddress,
      "--chains", chainId,
    ]);

    // Response: { ok, data: [{ tokenAssets: [...] }] }
    const dataArr = Array.isArray(raw?.data) ? raw.data : [raw?.data ?? raw];
    const holdings: TokenHolding[] = [];

    for (const chainGroup of dataArr) {
      const assets = chainGroup?.tokenAssets ?? chainGroup?.tokens ?? [];
      for (const asset of assets) {
        const addr = asset?.tokenContractAddress ?? "";
        if (!addr) continue;

        // Calculate USD value from balance * price
        const balance = parseFloat(asset?.balance ?? asset?.holdingAmount ?? "0");
        const price = parseFloat(asset?.tokenPrice ?? "0");
        const balanceUsd = asset?.tokenValueUsd ? parseFloat(asset.tokenValueUsd) : balance * price;

        // Skip dust (< $0.10)
        if (balanceUsd < 0.10) continue;

        holdings.push({
          tokenContractAddress: addr,
          tokenSymbol: asset?.symbol ?? asset?.tokenSymbol ?? "?",
          tokenName: asset?.tokenName ?? asset?.name ?? asset?.symbol ?? "Unknown",
          balance: String(asset?.balance ?? asset?.holdingAmount ?? "0"),
          balanceUsd: String(balanceUsd.toFixed(2)),
          chain,
        });
      }
    }

    return holdings;
  } catch {
    return [];
  }
}

// ── Monitor Class ──

export class PortfolioMonitor {
  private config: MonitorConfig;
  private monitoredTokens: Map<string, MonitoredToken> = new Map();
  private running = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private events: RiskSpikeEvent[] = [];

  constructor(config: Partial<MonitorConfig> & { walletAddress: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config } as MonitorConfig;
  }

  /** Start continuous monitoring */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(`\n🛡️  Token Watchdog — Portfolio Guardian`);
    console.log(`   Wallet: ${this.config.walletAddress}`);
    console.log(`   Chain: ${this.config.chain}`);
    console.log(`   Scan interval: ${this.config.scanIntervalMs / 1000}s`);
    console.log(`   Spike threshold: +${this.config.spikeThreshold} points`);
    console.log(`   Panic sell threshold: ${this.config.panicSellThreshold}/100\n`);

    // Initial scan
    await this.tick();

    // Continuous loop
    this.intervalHandle = setInterval(() => this.tick(), this.config.scanIntervalMs);
  }

  /** Stop monitoring */
  stop(): void {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Get current state */
  getState(): { tokens: MonitoredToken[]; events: RiskSpikeEvent[] } {
    return {
      tokens: Array.from(this.monitoredTokens.values()),
      events: [...this.events],
    };
  }

  /** Get recent events */
  getEvents(limit = 50): RiskSpikeEvent[] {
    return this.events.slice(-limit);
  }

  /** Single monitoring cycle */
  private async tick(): Promise<void> {
    const ts = () => new Date().toLocaleTimeString();

    try {
      // 1. Fetch current portfolio
      const holdings = await getPortfolioHoldings(
        this.config.walletAddress,
        this.config.chain
      );

      if (holdings.length === 0) {
        console.log(`[${ts()}] No token holdings found. Watching...`);
        return;
      }

      console.log(`[${ts()}] Scanning ${holdings.length} holdings...`);

      // 2. Scan each token (batched)
      for (let i = 0; i < holdings.length; i += this.config.maxConcurrentScans) {
        const batch = holdings.slice(i, i + this.config.maxConcurrentScans);

        await Promise.all(batch.map(async (holding) => {
          const key = `${holding.chain}:${holding.tokenContractAddress}`;
          const existing = this.monitoredTokens.get(key);

          // Skip if recently scanned (within half the interval)
          if (existing && Date.now() - existing.lastScanTime < this.config.scanIntervalMs / 2) {
            return;
          }

          try {
            const report = await scanToken(holding.tokenContractAddress, holding.chain);
            const previousScore = existing?.currentScore ?? 0;
            const currentScore = report.overallScore;
            const scoreDelta = currentScore - previousScore;

            const monitored: MonitoredToken = {
              holding,
              lastScan: report,
              previousScore,
              currentScore,
              scoreHistory: [
                ...(existing?.scoreHistory ?? []).slice(-50),
                { score: currentScore, timestamp: Date.now() },
              ],
              spikeDetected: scoreDelta >= this.config.spikeThreshold,
              lastScanTime: Date.now(),
            };

            this.monitoredTokens.set(key, monitored);

            // Status log
            const icon = currentScore >= this.config.panicSellThreshold ? "🚨" :
                         currentScore >= 60 ? "⚠️" :
                         currentScore >= 40 ? "🟡" : "✅";
            const deltaStr = existing ? ` (${scoreDelta >= 0 ? "+" : ""}${scoreDelta})` : "";
            console.log(`[${ts()}] ${icon} ${holding.tokenSymbol} — Score: ${currentScore}/100${deltaStr} | $${parseFloat(holding.balanceUsd).toFixed(2)}`);

            // 3. Detect risk spikes
            if (existing && scoreDelta >= this.config.spikeThreshold) {
              const action: RiskSpikeEvent["action"] =
                currentScore >= this.config.panicSellThreshold ? "PANIC_SELL" :
                currentScore >= 60 ? "ALERT" : "WATCH";

              const event: RiskSpikeEvent = {
                token: holding,
                previousScore,
                currentScore,
                scoreDelta,
                report,
                timestamp: Date.now(),
                action,
              };

              this.events.push(event);
              if (this.events.length > 200) this.events = this.events.slice(-100);

              console.log(`[${ts()}] 🚨 SPIKE DETECTED: ${holding.tokenSymbol} ${previousScore} → ${currentScore} (+${scoreDelta}) | Action: ${action}`);

              if (action === "PANIC_SELL") {
                console.log(`[${ts()}] 🔴 PANIC SELL TRIGGERED for ${holding.tokenSymbol}!`);
                console.log(`[${ts()}]    Reason: ${report.summary}`);
              }

              // Fire callback
              if (this.config.onSpikeDetected) {
                try {
                  await this.config.onSpikeDetected(event);
                } catch (err) {
                  console.error(`[${ts()}] Spike handler error:`, err);
                }
              }
            }
          } catch (err) {
            console.error(`[${ts()}] Failed to scan ${holding.tokenSymbol}:`, err);
          }
        }));
      }

      console.log(`[${ts()}] Cycle complete. Next scan in ${this.config.scanIntervalMs / 1000}s\n`);
    } catch (err) {
      console.error(`[${ts()}] Monitor cycle error:`, err);
    }
  }
}
