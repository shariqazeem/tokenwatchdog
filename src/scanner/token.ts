import { runJson, resolveChain } from "../utils/cli.js";
import type { TokenAdvancedInfo, TokenHolder, ClusterOverview } from "../utils/types.js";

/**
 * Get advanced token info including risk level, tags, holder concentration.
 */
export async function getAdvancedInfo(
  address: string,
  chain: string
): Promise<TokenAdvancedInfo | null> {
  const chainName = chain.toLowerCase();

  try {
    const raw = await runJson<any>(
      ["token", "advanced-info", "--address", address, "--chain", chainName]
    );

    const data = raw?.data ?? raw;

    return {
      tokenName: String(data?.tokenName ?? ""),
      tokenSymbol: String(data?.tokenSymbol ?? ""),
      tokenContractAddress: address,
      chainIndex: resolveChain(chain),
      riskControlLevel: Number(data?.riskControlLevel ?? 0),
      tokenTags: Array.isArray(data?.tokenTags) ? data.tokenTags : [],
      top10HoldPercent: Number(data?.top10HoldPercent ?? 0),
      devHoldingPercent: Number(data?.devHoldingPercent ?? 0),
      bundleHoldingPercent: Number(data?.bundleHoldingPercent ?? 0),
      communityRecognized: Boolean(data?.communityRecognized ?? data?.tagList?.communityRecognized ?? false),
      raw,
    };
  } catch {
    return null;
  }
}

/**
 * Get top holders for concentration analysis.
 */
export async function getTopHolders(
  address: string,
  chain: string,
  limit = 20
): Promise<TokenHolder[]> {
  const chainName = chain.toLowerCase();

  try {
    const raw = await runJson<any>(
      ["token", "holders", "--address", address, "--chain", chainName]
    );

    const list = raw?.data ?? raw ?? [];
    return (Array.isArray(list) ? list : []).map((h: any) => ({
      holderWalletAddress: String(h?.holderWalletAddress ?? h?.walletAddress ?? ""),
      holdAmount: String(h?.holdAmount ?? "0"),
      holdPercent: h?.holdPercent != null ? Number(h.holdPercent) : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Get holder cluster overview (concentration, rug pull probability).
 */
export async function getClusterOverview(
  address: string,
  chain: string
): Promise<ClusterOverview | null> {
  const chainName = chain.toLowerCase();

  try {
    const raw = await runJson<any>(
      ["token", "cluster-overview", "--address", address, "--chain", chainName]
    );

    const data = raw?.data ?? raw;

    return {
      clusterConcentration: data?.clusterConcentration ?? "Medium",
      rugPullPercent: Number(data?.rugPullPercent ?? 0),
      holderNewAddressPercent: Number(data?.holderNewAddressPercent ?? 0),
      raw,
    };
  } catch {
    return null;
  }
}

/**
 * Search for a token by name/symbol/address.
 */
export async function searchToken(
  query: string,
  chain: string
): Promise<any[]> {
  const chainName = chain.toLowerCase();

  try {
    const raw = await runJson<any>(
      ["token", "search", "--query", query, "--chains", chainName]
    );

    return raw?.data ?? (Array.isArray(raw) ? raw : []);
  } catch {
    return [];
  }
}
