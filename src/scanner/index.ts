import { scanTokenSecurity } from "./security.js";
import { scanDevInfo, scanBundleInfo } from "./trenches.js";
import { getAdvancedInfo, getTopHolders, getClusterOverview, searchToken } from "./token.js";
import { getTokenPriceInfo, getQuote, getIndexPrice } from "./market.js";
import { scanUniswap } from "./uniswap.js";
import { computeRiskScore } from "../scoring/engine.js";
import type { RiskReport, TokenQuery } from "../utils/types.js";

/**
 * Run a full Token Watchdog scan on a single token.
 * Executes all checks in parallel for speed, then computes composite risk score.
 *
 * Includes Uniswap AI Skills integration:
 *  - Discovers Uniswap v2/v3/v4 pools via DexScreener
 *  - Measures Uniswap-specific liquidity depth
 *  - Checks if swap routes through Uniswap
 *  - Adds Uniswap presence as a risk factor
 */
export async function scanToken(address: string, chain: string): Promise<RiskReport> {
  const token: TokenQuery = { address, chain };

  // Run all scans in parallel (Phase 1 — scans that don't depend on each other)
  const [
    security,
    devInfo,
    bundleInfo,
    advancedInfo,
    holders,
    clusterOverview,
    priceInfo,
    quote,
  ] = await Promise.all([
    scanTokenSecurity(address, chain),
    scanDevInfo(address, chain),
    scanBundleInfo(address, chain),
    getAdvancedInfo(address, chain),
    getTopHolders(address, chain),
    getClusterOverview(address, chain),
    getTokenPriceInfo(address, chain),
    getQuote(address, chain),
  ]);

  // Phase 2 — Uniswap scan can run after quote is available so it can
  // check whether the OKX aggregator routes through Uniswap.
  // We run it in parallel with the name/symbol search below.
  const uniswapPromise = scanUniswap(address, chain, quote);

  // Determine token name/symbol — fallback to search if advanced-info didn't return it
  let tokenName = advancedInfo?.tokenName ?? "";
  let tokenSymbol = advancedInfo?.tokenSymbol ?? "";

  if (!tokenName || !tokenSymbol) {
    try {
      const results = await searchToken(address, chain);
      if (results.length > 0) {
        tokenName = tokenName || results[0].tokenName || "Unknown";
        tokenSymbol = tokenSymbol || results[0].tokenSymbol || address.slice(0, 10);
      }
    } catch { /* ignore */ }
  }
  tokenName = tokenName || "Unknown";
  tokenSymbol = tokenSymbol || address.slice(0, 10);

  const uniswap = await uniswapPromise;

  return computeRiskScore({
    token,
    tokenName,
    tokenSymbol,
    security,
    devInfo,
    bundleInfo,
    advancedInfo,
    priceInfo,
    clusterOverview,
    holders,
    quote,
    uniswap: {
      hasUniswapPool: uniswap.hasUniswapPool,
      poolCount: uniswap.poolCount,
      totalLiquidityUsd: uniswap.totalLiquidityUsd,
      totalVolume24h: uniswap.totalVolume24h,
      bestVersion: uniswap.bestVersion,
      quoteUsesUniswapRouting: uniswap.quoteUsesUniswapRouting,
      riskScore: uniswap.riskScore,
      riskDetail: uniswap.riskDetail,
    },
  });
}

export { searchToken } from "./token.js";
