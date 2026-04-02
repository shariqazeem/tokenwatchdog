/**
 * Uniswap AI Skills Integration — scanner module
 *
 * Checks whether a token has Uniswap v2/v3/v4 pools, measures Uniswap-specific
 * liquidity depth, inspects swap-route data for Uniswap routing, and produces
 * a composite Uniswap risk signal for the Token Watchdog scoring engine.
 *
 * Data source: DexScreener public API (no auth required, 300 req/min).
 * Reference: .agents/skills/swap-planner/references/data-providers.md
 */

import { resolveChain } from "../utils/cli.js";
import type { QuoteResult } from "../utils/types.js";

// ── Types ──

/** A single Uniswap pool discovered via DexScreener */
export interface UniswapPool {
  pairAddress: string;
  baseTokenSymbol: string;
  quoteTokenSymbol: string;
  version: string;          // "v2", "v3", "v4" (from DexScreener labels)
  liquidityUsd: number;
  volume24h: number;
  priceUsd: string;
}

/** Aggregated Uniswap analysis for a token */
export interface UniswapAnalysis {
  /** Whether any Uniswap pools were found */
  hasUniswapPool: boolean;
  /** Number of Uniswap pools discovered */
  poolCount: number;
  /** Pools sorted by liquidity descending */
  pools: UniswapPool[];
  /** Total Uniswap liquidity across all pools (USD) */
  totalLiquidityUsd: number;
  /** Total 24h volume across Uniswap pools (USD) */
  totalVolume24h: number;
  /** Best available pool version ("v4" > "v3" > "v2" > "none") */
  bestVersion: string;
  /** Whether the OKX swap quote routes through Uniswap-style DEXes */
  quoteUsesUniswapRouting: boolean;
  /** Risk score 0-100 (higher = more dangerous) */
  riskScore: number;
  /** Human-readable detail for the scoring engine */
  riskDetail: string;
}

// ── DexScreener chain name mapping ──

const DEXSCREENER_CHAIN_MAP: Record<string, string> = {
  "1":     "ethereum",
  "8453":  "base",
  "42161": "arbitrum",
  "10":    "optimism",
  "137":   "polygon",
  "56":    "bsc",
  "43114": "avalanche",
  "196":   "xlayer",       // X Layer — limited DexScreener coverage
  "130":   "unichain",
};

function dexScreenerNetwork(chain: string): string | null {
  const chainId = resolveChain(chain);
  if (DEXSCREENER_CHAIN_MAP[chainId]) return DEXSCREENER_CHAIN_MAP[chainId];
  // If the caller already passed a network name that matches DexScreener naming
  const lower = chain.toLowerCase();
  const validNames = new Set(Object.values(DEXSCREENER_CHAIN_MAP));
  if (validNames.has(lower)) return lower;
  return null;
}

// ── DexScreener fetch helper ──

async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Core: discover Uniswap pools for a token ──

async function discoverUniswapPools(
  tokenAddress: string,
  chain: string,
): Promise<UniswapPool[]> {
  const network = dexScreenerNetwork(chain);
  if (!network) return [];

  // DexScreener endpoint: all pairs containing this token on the given network
  const url = `https://api.dexscreener.com/token-pairs/v1/${network}/${tokenAddress}`;
  const data = await fetchJson<any[]>(url);

  if (!Array.isArray(data)) return [];

  // Filter to Uniswap pools only (dexId === "uniswap")
  const uniPairs = data.filter(
    (p: any) =>
      typeof p?.dexId === "string" &&
      p.dexId.toLowerCase() === "uniswap",
  );

  return uniPairs.map((p: any): UniswapPool => ({
    pairAddress: String(p.pairAddress ?? ""),
    baseTokenSymbol: String(p.baseToken?.symbol ?? ""),
    quoteTokenSymbol: String(p.quoteToken?.symbol ?? ""),
    version: extractVersion(p),
    liquidityUsd: Number(p.liquidity?.usd ?? 0),
    volume24h: Number(p.volume?.h24 ?? 0),
    priceUsd: String(p.priceUsd ?? "0"),
  }));
}

function extractVersion(pair: any): string {
  // DexScreener puts version labels in the `labels` array
  const labels: string[] = Array.isArray(pair?.labels) ? pair.labels : [];
  for (const l of labels) {
    const lower = String(l).toLowerCase();
    if (lower.includes("v4")) return "v4";
    if (lower.includes("v3")) return "v3";
    if (lower.includes("v2")) return "v2";
  }
  return "unknown";
}

// ── Check if OKX quote routes through Uniswap ──

function quoteRoutesViaUniswap(quote: QuoteResult | null | undefined): boolean {
  if (!quote?.raw) return false;

  try {
    const raw = quote.raw as any;

    // OKX DEX aggregator returns dexRouterList with per-hop dex info
    const routes: any[] = raw?.data?.[0]?.dexRouterList ?? raw?.dexRouterList ?? [];
    for (const route of routes) {
      const subRouters: any[] = route?.subRouterList ?? route?.dexProtocol ?? [];
      for (const sub of subRouters) {
        const dexName = String(sub?.dexName ?? sub?.dexProtocol ?? sub?.name ?? "").toLowerCase();
        if (
          dexName.includes("uniswap") ||
          dexName.includes("uni_v2") ||
          dexName.includes("uni_v3") ||
          dexName.includes("uni_v4")
        ) {
          return true;
        }
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return false;
}

// ── Risk scoring ──

function computeUniswapRisk(
  pools: UniswapPool[],
  totalLiquidity: number,
  routesViaUniswap: boolean,
): { score: number; detail: string } {
  const details: string[] = [];
  let score = 0;

  if (pools.length === 0) {
    // No Uniswap pool is a risk signal — token may lack legitimate DEX presence
    score = 40;
    details.push("No Uniswap pools found — token may lack deep DEX liquidity");
    return { score, detail: details.join(". ") };
  }

  // Pool count — a single pool with no alternatives is riskier
  if (pools.length === 1) {
    score = Math.max(score, 20);
    details.push("Only 1 Uniswap pool — limited trading venues");
  } else {
    details.push(`${pools.length} Uniswap pools detected`);
  }

  // Liquidity thresholds (aligned with Uniswap AI Skills risk table)
  if (totalLiquidity < 10_000) {
    score = Math.max(score, 70);
    details.push(
      `Very low Uniswap liquidity: $${(totalLiquidity).toFixed(0)} — extreme slippage risk`,
    );
  } else if (totalLiquidity < 100_000) {
    score = Math.max(score, 45);
    details.push(
      `Low Uniswap liquidity: $${(totalLiquidity / 1000).toFixed(1)}K — high slippage risk`,
    );
  } else if (totalLiquidity < 1_000_000) {
    score = Math.max(score, 20);
    details.push(
      `Moderate Uniswap liquidity: $${(totalLiquidity / 1000).toFixed(1)}K`,
    );
  } else {
    details.push(
      `Good Uniswap liquidity: $${(totalLiquidity / 1_000_000).toFixed(2)}M`,
    );
  }

  // Version signal — v4 pools with hooks can introduce additional risk vectors
  const versions = new Set(pools.map((p) => p.version));
  if (versions.has("v4")) {
    // v4 hooks can introduce NoOp rug-pull vectors (see v4-security-foundations skill)
    score = Math.max(score, 25);
    details.push(
      "Uniswap v4 pool detected — custom hooks may carry additional risk (review hook permissions)",
    );
  }
  if (versions.has("v3")) {
    details.push("Uniswap v3 concentrated-liquidity pool available");
  }
  if (versions.has("v2")) {
    details.push("Uniswap v2 full-range pool available");
  }

  // Volume vs liquidity ratio — very low volume relative to liquidity can
  // indicate an inactive or abandoned pool
  const totalVolume = pools.reduce((s, p) => s + p.volume24h, 0);
  if (totalLiquidity > 0 && totalVolume / totalLiquidity < 0.01 && totalLiquidity > 10_000) {
    score = Math.max(score, 30);
    details.push(
      `24h volume/liquidity ratio extremely low (${((totalVolume / totalLiquidity) * 100).toFixed(2)}%) — pool may be inactive`,
    );
  }

  // Routing confirmation — if OKX aggregator does NOT route through Uniswap,
  // but pools exist, it may mean the pools have worse pricing or are illiquid
  if (!routesViaUniswap && pools.length > 0) {
    details.push(
      "OKX aggregator did not route through Uniswap — other DEXes may offer better pricing",
    );
  } else if (routesViaUniswap) {
    details.push("OKX swap quote routes through Uniswap");
  }

  if (details.length === 0) {
    details.push("Uniswap pool presence looks healthy");
  }

  return { score: Math.min(score, 100), detail: details.join(". ") };
}

// ── Public API ──

/**
 * Run a full Uniswap-specific analysis on a token.
 *
 * @param address  Token contract address
 * @param chain    Chain name or ID (e.g. "xlayer", "196", "ethereum", "1")
 * @param quote    Optional OKX quote result (used to check routing)
 */
export async function scanUniswap(
  address: string,
  chain: string,
  quote?: QuoteResult | null,
): Promise<UniswapAnalysis> {
  const pools = await discoverUniswapPools(address, chain);

  // Sort by liquidity descending
  pools.sort((a, b) => b.liquidityUsd - a.liquidityUsd);

  const totalLiquidityUsd = pools.reduce((s, p) => s + p.liquidityUsd, 0);
  const totalVolume24h = pools.reduce((s, p) => s + p.volume24h, 0);
  const routesViaUniswap = quoteRoutesViaUniswap(quote);

  // Determine best version
  let bestVersion = "none";
  for (const p of pools) {
    if (p.version === "v4") { bestVersion = "v4"; break; }
    if (p.version === "v3" && bestVersion !== "v4") bestVersion = "v3";
    if (p.version === "v2" && bestVersion === "none") bestVersion = "v2";
  }

  const { score, detail } = computeUniswapRisk(pools, totalLiquidityUsd, routesViaUniswap);

  return {
    hasUniswapPool: pools.length > 0,
    poolCount: pools.length,
    pools,
    totalLiquidityUsd,
    totalVolume24h,
    bestVersion,
    quoteUsesUniswapRouting: routesViaUniswap,
    riskScore: score,
    riskDetail: detail,
  };
}
