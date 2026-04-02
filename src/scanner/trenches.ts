import { runJson, resolveChain } from "../utils/cli.js";
import type { DevInfo, BundleInfo } from "../utils/types.js";

/**
 * Get developer reputation info (rug pull history, holdings, etc.)
 */
export async function scanDevInfo(
  address: string,
  chain: string
): Promise<DevInfo | null> {
  const chainName = chain.toLowerCase();

  try {
    const raw = await runJson<any>(
      ["memepump", "token-dev-info", "--address", address, "--chain", chainName]
    );

    const dev = raw?.data ?? raw?.devLaunchedInfo ?? raw;
    const holding = raw?.devHoldingInfo ?? dev;

    return {
      devAddress: String(holding?.devAddress ?? ""),
      fundingAddress: String(holding?.fundingAddress ?? ""),
      totalTokens: Number(dev?.totalTokens ?? dev?.devLaunchedInfo?.totalTokens ?? 0),
      rugPullCount: Number(dev?.rugPullCount ?? dev?.devLaunchedInfo?.rugPullCount ?? 0),
      migratedCount: Number(dev?.migratedCount ?? dev?.devLaunchedInfo?.migratedCount ?? 0),
      goldenGemCount: Number(dev?.goldenGemCount ?? dev?.devLaunchedInfo?.goldenGemCount ?? 0),
      devHoldingPercent: Number(holding?.devHoldingPercent ?? 0),
      raw,
    };
  } catch {
    return null; // Not all tokens are on pump platforms
  }
}

/**
 * Get bundle/sniper detection info.
 */
export async function scanBundleInfo(
  address: string,
  chain: string
): Promise<BundleInfo | null> {
  const chainName = chain.toLowerCase();

  try {
    const raw = await runJson<any>(
      ["memepump", "token-bundle-info", "--address", address, "--chain", chainName]
    );

    const data = raw?.data ?? raw;

    return {
      bundlerAthPercent: Number(data?.bundlerAthPercent ?? 0),
      totalBundlers: Number(data?.totalBundlers ?? 0),
      bundledValueNative: String(data?.bundledValueNative ?? "0"),
      bundledTokenAmount: String(data?.bundledTokenAmount ?? "0"),
      raw,
    };
  } catch {
    return null;
  }
}
