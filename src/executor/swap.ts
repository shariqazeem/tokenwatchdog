import { run, runJson } from "../utils/cli.js";
import type { SafeSwapRequest, SafeSwapResult, RiskReport } from "../utils/types.js";
import { scanToken } from "../scanner/index.js";

const DEFAULT_MAX_RISK = 60;

/**
 * Execute a swap ONLY if the target token passes the safety threshold.
 */
export async function safeSwap(req: SafeSwapRequest): Promise<SafeSwapResult> {
  const maxRisk = req.maxRiskScore ?? DEFAULT_MAX_RISK;

  // Step 1: Run full risk analysis
  const report = await scanToken(req.toToken, req.chain);

  if (report.overallScore >= maxRisk) {
    return {
      allowed: false,
      riskReport: report,
      error: `Token risk score ${report.overallScore}/100 exceeds threshold ${maxRisk}. ${report.summary}`,
    };
  }

  // Step 2: Execute swap via onchainos
  try {
    const args = [
      "swap", "execute",
      "--from", req.fromToken,
      "--to", req.toToken,
      "--readable-amount", req.amount,
      "--chain", req.chain,
      "--wallet", req.wallet,
    ];

    if (req.slippage) {
      args.push("--slippage", req.slippage);
    }

    const result = await runJson<any>(args, 60_000);
    const data = result?.data ?? result;

    return {
      allowed: true,
      riskReport: report,
      swapTxHash: data?.swapTxHash ?? data?.txHash ?? "",
      fromAmount: data?.fromAmount ?? req.amount,
      toAmount: data?.toAmount ?? "",
    };
  } catch (err) {
    return {
      allowed: true,
      riskReport: report,
      error: `Swap execution failed: ${err}`,
    };
  }
}

/**
 * Get a safe quote — quote + risk check without executing.
 */
export async function safeQuote(
  fromToken: string,
  toToken: string,
  amount: string,
  chain: string,
  maxRisk = DEFAULT_MAX_RISK
): Promise<{ allowed: boolean; report: RiskReport; quote?: any }> {
  const report = await scanToken(toToken, chain);

  if (report.overallScore >= maxRisk) {
    return { allowed: false, report };
  }

  try {
    const quote = await runJson<any>([
      "swap", "quote",
      "--from", fromToken,
      "--to", toToken,
      "--readable-amount", amount,
      "--chain", chain,
    ]);
    return { allowed: true, report, quote };
  } catch {
    return { allowed: true, report };
  }
}
