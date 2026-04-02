#!/usr/bin/env node

import { Command } from "commander";
import { scanToken, searchToken } from "./scanner/index.js";
import { safeSwap, safeQuote } from "./executor/swap.js";
import type { RiskReport } from "./utils/types.js";

const DEFAULT_CHAIN = process.env.DEFAULT_CHAIN || "xlayer";

// ── Formatting ──

function levelColor(level: string): string {
  const colors: Record<string, string> = {
    SAFE: "\x1b[32m",      // green
    CAUTION: "\x1b[33m",   // yellow
    WARNING: "\x1b[38;5;208m", // orange
    DANGER: "\x1b[31m",    // red
    CRITICAL: "\x1b[91m",  // bright red
  };
  return `${colors[level] ?? ""}${level}\x1b[0m`;
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const color = score >= 80 ? "\x1b[91m" : score >= 60 ? "\x1b[31m" : score >= 40 ? "\x1b[33m" : "\x1b[32m";
  return `${color}${"█".repeat(filled)}${"░".repeat(empty)}\x1b[0m ${score}/100`;
}

function printReport(report: RiskReport): void {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log(`║  TOKEN WATCHDOG REPORT                                      ║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Token:  ${report.tokenSymbol} (${report.tokenName})`);
  console.log(`║  Chain:  ${report.token.chain}`);
  console.log(`║  Address: ${report.token.address}`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Risk Level: ${levelColor(report.level)}`);
  console.log(`║  Score:      ${scoreBar(report.overallScore)}`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  RISK FACTORS:");

  for (const factor of report.factors) {
    const weighted = Math.round(factor.score * factor.weight);
    const indicator = factor.score >= 70 ? "🔴" : factor.score >= 40 ? "🟡" : "🟢";
    console.log(`║  ${indicator} ${factor.name.padEnd(25)} ${String(factor.score).padStart(3)}/100 (w:${(factor.weight * 100).toFixed(0)}%) → +${weighted}`);
    console.log(`║     ${factor.detail}`);
  }

  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  ${report.summary}`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  ${report.recommendation}`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
}

function printJson(report: RiskReport): void {
  console.log(JSON.stringify({
    tokenSymbol: report.tokenSymbol,
    tokenName: report.tokenName,
    chain: report.token.chain,
    address: report.token.address,
    overallScore: report.overallScore,
    level: report.level,
    summary: report.summary,
    recommendation: report.recommendation,
    factors: report.factors.map(f => ({
      name: f.name,
      score: f.score,
      weight: f.weight,
      detail: f.detail,
    })),
    timestamp: report.timestamp,
  }, null, 2));
}

// ── CLI ──

const program = new Command();

program
  .name("token-watchdog")
  .description("Protect agents and humans from rug pulls — composite risk analysis + safe swap execution on X Layer")
  .version("1.0.0");

program
  .command("scan")
  .description("Run a full risk analysis on a token")
  .argument("<address>", "Token contract address")
  .option("-c, --chain <chain>", "Chain name or ID", DEFAULT_CHAIN)
  .option("--json", "Output as JSON")
  .action(async (address: string, opts: { chain: string; json?: boolean }) => {
    try {
      const report = await scanToken(address, opts.chain);
      if (opts.json) {
        printJson(report);
      } else {
        printReport(report);
      }
      process.exit(report.overallScore >= 60 ? 1 : 0);
    } catch (err) {
      console.error("Scan failed:", err);
      process.exit(2);
    }
  });

program
  .command("search")
  .description("Search for tokens by name, symbol, or address")
  .argument("<query>", "Search query")
  .option("-c, --chain <chain>", "Chain name or ID", DEFAULT_CHAIN)
  .action(async (query: string, opts: { chain: string }) => {
    try {
      const results = await searchToken(query, opts.chain);
      if (!results.length) {
        console.log("No tokens found.");
        return;
      }
      console.log(`\nFound ${results.length} tokens:\n`);
      for (const t of results.slice(0, 10)) {
        const verified = t.tagList?.communityRecognized ? "✓" : "✗";
        console.log(`  [${verified}] ${t.tokenSymbol ?? "?"} — ${t.tokenName ?? "?"}`);
        console.log(`      Address: ${t.tokenContractAddress}`);
        console.log(`      Price: $${t.price ?? "?"} | MCap: $${t.marketCap ?? "?"} | Liquidity: $${t.liquidity ?? "?"}`);
        console.log("");
      }
    } catch (err) {
      console.error("Search failed:", err);
      process.exit(2);
    }
  });

program
  .command("safe-buy")
  .description("Buy a token only if it passes safety checks")
  .argument("<token>", "Token address to buy")
  .option("-a, --amount <amount>", "Amount in USDC to spend", "100")
  .option("-c, --chain <chain>", "Chain", DEFAULT_CHAIN)
  .option("-w, --wallet <wallet>", "Wallet address (required)")
  .option("-t, --threshold <threshold>", "Max risk score (0-100)", "60")
  .option("--json", "Output as JSON")
  .action(async (token: string, opts: { amount: string; chain: string; wallet?: string; threshold: string; json?: boolean }) => {
    if (!opts.wallet) {
      console.error("Error: --wallet is required for safe-buy");
      process.exit(1);
    }

    // Resolve USDC address for chain
    const usdcMap: Record<string, string> = {
      xlayer: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
      "196": "0x74b7f16337b8972027f6196a17a631ac6de26d22",
      ethereum: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "1": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    };
    const usdc = usdcMap[opts.chain.toLowerCase()] ?? usdcMap["xlayer"]!;

    const result = await safeSwap({
      fromToken: usdc,
      toToken: token,
      amount: opts.amount,
      chain: opts.chain,
      wallet: opts.wallet,
      maxRiskScore: parseInt(opts.threshold),
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printReport(result.riskReport);
      if (result.allowed) {
        if (result.swapTxHash) {
          console.log(`\n✅ Swap executed! TX: ${result.swapTxHash}`);
        }
      } else {
        console.log(`\n🚫 SWAP BLOCKED: ${result.error}`);
      }
    }

    process.exit(result.allowed ? 0 : 1);
  });

program
  .command("watch")
  .description("Continuously scan trending tokens and alert on safe ones")
  .option("-c, --chain <chain>", "Chain", DEFAULT_CHAIN)
  .option("-i, --interval <seconds>", "Scan interval in seconds", "60")
  .option("-t, --threshold <threshold>", "Max risk score to flag as safe", "40")
  .action(async (opts: { chain: string; interval: string; threshold: string }) => {
    const intervalMs = parseInt(opts.interval) * 1000;
    const threshold = parseInt(opts.threshold);

    console.log(`\n👁  Token Watchdog — Watch Mode`);
    console.log(`   Chain: ${opts.chain} | Interval: ${opts.interval}s | Safe threshold: <${threshold}\n`);

    const tick = async () => {
      try {
        const tokens = await searchToken("", opts.chain);
        // Use hot-tokens if search returns empty
        if (!tokens.length) {
          console.log(`[${new Date().toLocaleTimeString()}] No trending tokens found. Waiting...`);
          return;
        }

        for (const t of tokens.slice(0, 5)) {
          const addr = t.tokenContractAddress;
          if (!addr) continue;
          const report = await scanToken(addr, opts.chain);
          const indicator = report.overallScore < threshold ? "✅" : report.overallScore < 60 ? "⚠️" : "🚫";
          console.log(`[${new Date().toLocaleTimeString()}] ${indicator} ${report.tokenSymbol} — Score: ${report.overallScore}/100 (${report.level})`);
          if (report.overallScore < threshold) {
            console.log(`   → SAFE: ${report.summary}`);
          }
        }
        console.log("");
      } catch (err) {
        console.error(`[${new Date().toLocaleTimeString()}] Scan error:`, err);
      }
    };

    await tick();
    setInterval(tick, intervalMs);
  });

program.parse();
