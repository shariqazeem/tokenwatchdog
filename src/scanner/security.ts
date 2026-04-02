import { runJson, resolveChain } from "../utils/cli.js";
import type { SecurityScanResult } from "../utils/types.js";

/**
 * Run okx-security token-scan for honeypot/risk detection.
 */
export async function scanTokenSecurity(
  address: string,
  chain: string
): Promise<SecurityScanResult> {
  const chainId = resolveChain(chain);
  const tokenParam = `${chainId}:${address}`;

  try {
    const raw = await runJson<any>(
      ["security", "token-scan", "--tokens", tokenParam]
    );

    // Response structure: { ok: true, data: { ... } } or nested
    const data = raw?.data?.[0] ?? raw?.data ?? raw?.[0] ?? raw;

    // buyTaxes/sellTaxes can be null from the API — treat null as "0"
    const buyTaxes = data?.buyTaxes ?? data?.buy_taxes;
    const sellTaxes = data?.sellTaxes ?? data?.sell_taxes;

    return {
      chainIndex: chainId,
      tokenContractAddress: address,
      isRiskToken: data?.isRiskToken === true || data?.is_risk_token === true,
      buyTaxes: buyTaxes != null ? String(buyTaxes) : "0",
      sellTaxes: sellTaxes != null ? String(sellTaxes) : "0",
      isHoneyPot: data?.isHoneyPot === true || data?.is_honeypot === true,
      isChainSupported: data?.isChainSupported !== false,
      raw: data,
    };
  } catch (err) {
    // Fail-safe: treat scan failure as risky
    return {
      chainIndex: chainId,
      tokenContractAddress: address,
      isRiskToken: true,
      buyTaxes: "unknown",
      sellTaxes: "unknown",
      isHoneyPot: undefined,
      isChainSupported: false,
      raw: { error: String(err) },
    };
  }
}
