import { scanTokenSecurity } from "./security.js";
import { scanDevInfo, scanBundleInfo } from "./trenches.js";
import { getAdvancedInfo, getTopHolders, getClusterOverview, searchToken } from "./token.js";
import { getTokenPriceInfo, getQuote, getIndexPrice } from "./market.js";
import { computeRiskScore } from "../scoring/engine.js";
import type { RiskReport, TokenQuery } from "../utils/types.js";

/**
 * Run a full Token Watchdog scan on a single token.
 * Executes all checks in parallel for speed, then computes composite risk score.
 */
export async function scanToken(address: string, chain: string): Promise<RiskReport> {
  const token: TokenQuery = { address, chain };

  // Run all scans in parallel
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
  });
}

export { searchToken } from "./token.js";
