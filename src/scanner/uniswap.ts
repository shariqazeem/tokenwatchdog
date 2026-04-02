/**
 * Uniswap AI Skills Integration — scanner module
 *
 * Checks whether a token has Uniswap v2/v3/v4 pools, measures Uniswap-specific
 * liquidity depth, inspects swap-route data for Uniswap routing, analyzes V4
 * hook permissions for security risks, and produces a composite Uniswap risk
 * signal for the Token Watchdog scoring engine.
 *
 * V4 Hook Security Analysis:
 *  - Decodes hook permission flags from the hook contract address (address
 *    bits encode permissions per the Hooks library bitmask pattern).
 *  - Flags dangerous permissions: BEFORE_SWAP_RETURNS_DELTA (NoOp rug pull
 *    vector), AFTER_SWAP_RETURNS_DELTA, BEFORE_ADD_LIQUIDITY,
 *    AFTER_REMOVE_LIQUIDITY, and other high/critical risk flags.
 *  - References: .agents/skills/v4-security-foundations/SKILL.md
 *
 * Data sources:
 *  - DexScreener public API (no auth required, 300 req/min)
 *  - Direct JSON-RPC to X Layer (https://rpc.xlayer.tech) for V4 hook queries
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

// ── V4 Hook Security Types ──

/**
 * Risk level for a V4 hook permission, aligned with the v4-security-foundations
 * skill threat model.
 */
export type V4HookRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** A single V4 hook permission flag with its decoded status and risk level */
export interface V4HookPermission {
  name: string;
  enabled: boolean;
  riskLevel: V4HookRiskLevel;
  description: string;
}

/** Result of analyzing a single V4 hook address */
export interface V4HookAnalysis {
  /** The hook contract address (permissions are encoded in the address bits) */
  hookAddress: string;
  /** The pool address this hook is attached to */
  poolAddress: string;
  /** All 14 decoded permission flags */
  permissions: V4HookPermission[];
  /** Only the permissions that are enabled */
  enabledPermissions: V4HookPermission[];
  /** Only the dangerous enabled permissions (HIGH or CRITICAL) */
  dangerousPermissions: V4HookPermission[];
  /** Whether the NoOp rug-pull vector (BEFORE_SWAP_RETURNS_DELTA) is active */
  hasNoOpRugVector: boolean;
  /** Aggregate hook risk score 0-100 */
  hookRiskScore: number;
  /** Human-readable risk summary */
  hookRiskDetail: string;
}

/** Aggregate result of analyzing all V4 hooks for a token */
export interface V4HookScanResult {
  /** Whether any V4 pools were found and analyzed */
  v4PoolsAnalyzed: number;
  /** Per-hook analysis results */
  hooks: V4HookAnalysis[];
  /** Highest risk score across all hooks */
  worstHookRiskScore: number;
  /** Summary of V4 hook findings */
  summary: string;
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
  /** V4 hook security analysis (present only if V4 pools were found) */
  v4HookAnalysis?: V4HookScanResult;
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

// ── RPC endpoints per chain for V4 hook queries ──

const RPC_ENDPOINTS: Record<string, string> = {
  "196":   "https://rpc.xlayer.tech",
  "1":     "https://eth.llamarpc.com",
  "8453":  "https://mainnet.base.org",
  "42161": "https://arb1.arbitrum.io/rpc",
  "10":    "https://mainnet.optimism.io",
  "137":   "https://polygon-rpc.com",
};

function getRpcEndpoint(chain: string): string | null {
  const chainId = resolveChain(chain);
  return RPC_ENDPOINTS[chainId] ?? null;
}

// ── Fetch helpers ──

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

/** Send a JSON-RPC eth_call to a chain's RPC endpoint */
async function rpcCall(
  rpcUrl: string,
  to: string,
  data: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(rpcUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string; error?: unknown };
    if (json.error || !json.result) return null;
    return json.result;
  } catch {
    return null;
  }
}

/** Send a JSON-RPC eth_getCode to check if an address has code deployed */
async function rpcGetCode(
  rpcUrl: string,
  address: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(rpcUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [address, "latest"],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string; error?: unknown };
    if (json.error || !json.result) return null;
    return json.result;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// V4 HOOK PERMISSION FLAGS — BITMASK DECODING
//
// In Uniswap V4, hook permissions are encoded directly in the hook contract
// address. The lower 14 bits of the address determine which callbacks the
// PoolManager will invoke. This is enforced by the Hooks library at pool
// creation time — the hook address must have the correct bits set for the
// permissions it declares.
//
// Bit positions (from LSB, bit 0 = rightmost):
//   Bit 13: beforeInitialize
//   Bit 12: afterInitialize
//   Bit 11: beforeAddLiquidity
//   Bit 10: afterAddLiquidity
//   Bit  9: beforeRemoveLiquidity
//   Bit  8: afterRemoveLiquidity
//   Bit  7: beforeSwap
//   Bit  6: afterSwap
//   Bit  5: beforeDonate
//   Bit  4: afterDonate
//   Bit  3: beforeSwapReturnDelta
//   Bit  2: afterSwapReturnDelta
//   Bit  1: afterAddLiquidityReturnDelta
//   Bit  0: afterRemoveLiquidityReturnDelta
//
// Risk levels per the v4-security-foundations skill:
//   CRITICAL: beforeSwapReturnDelta (NoOp rug pull attack vector)
//   HIGH:     beforeSwap, beforeRemoveLiquidity, afterSwapReturnDelta,
//             afterAddLiquidityReturnDelta, afterRemoveLiquidityReturnDelta
//   MEDIUM:   beforeAddLiquidity, afterSwap
//   LOW:      beforeInitialize, afterInitialize, afterAddLiquidity,
//             afterRemoveLiquidity, beforeDonate, afterDonate
// ══════════════════════════════════════════════════════════════════════════════

interface HookFlagDef {
  bit: number;
  name: string;
  riskLevel: V4HookRiskLevel;
  description: string;
}

/**
 * All 14 V4 hook permission flags, ordered by bit position (MSB to LSB).
 * Bit numbering: bit 13 is the highest (0x2000), bit 0 is the lowest (0x0001).
 */
const V4_HOOK_FLAGS: HookFlagDef[] = [
  { bit: 13, name: "BEFORE_INITIALIZE",                    riskLevel: "LOW",      description: "Called before pool creation — validates pool parameters" },
  { bit: 12, name: "AFTER_INITIALIZE",                     riskLevel: "LOW",      description: "Called after pool creation — safe for state initialization" },
  { bit: 11, name: "BEFORE_ADD_LIQUIDITY",                 riskLevel: "MEDIUM",   description: "Before LP deposits — can block legitimate LPs" },
  { bit: 10, name: "AFTER_ADD_LIQUIDITY",                  riskLevel: "LOW",      description: "After LP deposits — safe for tracking/rewards" },
  { bit:  9, name: "BEFORE_REMOVE_LIQUIDITY",              riskLevel: "HIGH",     description: "Before LP withdrawals — can trap user funds" },
  { bit:  8, name: "AFTER_REMOVE_LIQUIDITY",               riskLevel: "LOW",      description: "After LP withdrawals — safe for tracking" },
  { bit:  7, name: "BEFORE_SWAP",                          riskLevel: "HIGH",     description: "Before swap execution — can manipulate prices" },
  { bit:  6, name: "AFTER_SWAP",                           riskLevel: "MEDIUM",   description: "After swap execution — can observe final state" },
  { bit:  5, name: "BEFORE_DONATE",                        riskLevel: "LOW",      description: "Before donations — access control only" },
  { bit:  4, name: "AFTER_DONATE",                         riskLevel: "LOW",      description: "After donations — safe for tracking" },
  { bit:  3, name: "BEFORE_SWAP_RETURNS_DELTA",            riskLevel: "CRITICAL", description: "Returns custom swap amounts — NoOp rug-pull attack vector: hook can steal all input tokens" },
  { bit:  2, name: "AFTER_SWAP_RETURNS_DELTA",             riskLevel: "HIGH",     description: "Modifies post-swap amounts — can extract value from swappers" },
  { bit:  1, name: "AFTER_ADD_LIQUIDITY_RETURNS_DELTA",    riskLevel: "HIGH",     description: "Modifies LP token amounts — can shortchange liquidity providers" },
  { bit:  0, name: "AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA", riskLevel: "HIGH",     description: "Modifies withdrawal amounts — can steal funds on LP exit" },
];

/** Risk level numeric values for scoring */
const RISK_LEVEL_SCORES: Record<V4HookRiskLevel, number> = {
  LOW:      2,
  MEDIUM:   5,
  HIGH:     12,
  CRITICAL: 25,
};

/**
 * Decode V4 hook permissions from a hook contract address.
 *
 * The lower 14 bits of the address encode which permissions are enabled.
 * This is the same bitmask check performed by the Hooks.sol library in
 * v4-core: `uint160(hookAddress) & HOOK_FLAG_MASK`.
 */
function decodeHookPermissions(hookAddress: string): V4HookPermission[] {
  // Parse the address as a BigInt, then extract the lower 14 bits
  const addrBigInt = BigInt(hookAddress);

  return V4_HOOK_FLAGS.map((flag): V4HookPermission => ({
    name: flag.name,
    enabled: (addrBigInt & (1n << BigInt(flag.bit))) !== 0n,
    riskLevel: flag.riskLevel,
    description: flag.description,
  }));
}

/**
 * Compute a risk score for a single V4 hook based on its enabled permissions.
 *
 * Scoring approach (inspired by the v4-security-foundations risk scoring):
 *  - Each enabled permission contributes its risk-level score
 *  - CRITICAL permissions (NoOp) immediately elevate to 80+
 *  - Multiple HIGH permissions compound the risk
 *  - Score is capped at 100
 */
function scoreHookPermissions(permissions: V4HookPermission[]): number {
  const enabled = permissions.filter((p) => p.enabled);
  if (enabled.length === 0) return 0;

  let score = 0;

  // Base score: sum of risk-level scores for enabled permissions
  for (const perm of enabled) {
    score += RISK_LEVEL_SCORES[perm.riskLevel];
  }

  // CRITICAL escalation: BEFORE_SWAP_RETURNS_DELTA is the NoOp rug vector
  const hasCritical = enabled.some((p) => p.riskLevel === "CRITICAL");
  if (hasCritical) {
    score = Math.max(score, 80);
  }

  // HIGH escalation: multiple HIGH permissions compound the danger
  const highCount = enabled.filter((p) => p.riskLevel === "HIGH").length;
  if (highCount >= 3) {
    score = Math.max(score, 70);
  } else if (highCount >= 2) {
    score = Math.max(score, 55);
  } else if (highCount >= 1) {
    score = Math.max(score, 35);
  }

  return Math.min(score, 100);
}

/**
 * Build a human-readable risk detail for a single hook.
 */
function buildHookRiskDetail(
  hookAddress: string,
  permissions: V4HookPermission[],
  score: number,
): string {
  const enabled = permissions.filter((p) => p.enabled);
  const dangerous = enabled.filter((p) => p.riskLevel === "HIGH" || p.riskLevel === "CRITICAL");

  const parts: string[] = [];
  const shortAddr = `${hookAddress.slice(0, 6)}...${hookAddress.slice(-4)}`;

  if (enabled.length === 0) {
    return `Hook ${shortAddr}: no permissions enabled (passive hook)`;
  }

  parts.push(`Hook ${shortAddr}: ${enabled.length} permission(s) enabled`);

  // Highlight critical permissions
  const critical = enabled.filter((p) => p.riskLevel === "CRITICAL");
  if (critical.length > 0) {
    parts.push(
      `CRITICAL: ${critical.map((p) => p.name).join(", ")} — ` +
      `NoOp rug-pull vector active (hook can steal swap input tokens)`
    );
  }

  // Highlight high-risk permissions
  const high = enabled.filter((p) => p.riskLevel === "HIGH");
  if (high.length > 0) {
    parts.push(
      `HIGH RISK: ${high.map((p) => p.name).join(", ")}`
    );
  }

  if (dangerous.length === 0) {
    parts.push("No dangerous permissions detected");
  }

  return parts.join(". ");
}

/**
 * Analyze a single V4 hook address for security risks.
 * Decodes permission flags from the address bitmask and scores the risk.
 */
function analyzeHookAddress(hookAddress: string, poolAddress: string): V4HookAnalysis {
  const permissions = decodeHookPermissions(hookAddress);
  const enabledPermissions = permissions.filter((p) => p.enabled);
  const dangerousPermissions = enabledPermissions.filter(
    (p) => p.riskLevel === "HIGH" || p.riskLevel === "CRITICAL",
  );
  const hasNoOpRugVector = enabledPermissions.some(
    (p) => p.name === "BEFORE_SWAP_RETURNS_DELTA",
  );
  const hookRiskScore = scoreHookPermissions(permissions);
  const hookRiskDetail = buildHookRiskDetail(hookAddress, permissions, hookRiskScore);

  return {
    hookAddress,
    poolAddress,
    permissions,
    enabledPermissions,
    dangerousPermissions,
    hasNoOpRugVector,
    hookRiskScore,
    hookRiskDetail,
  };
}

/**
 * Attempt to read the hook address from a V4 pool contract via RPC.
 *
 * Strategy: In Uniswap V4, the PoolKey struct contains the hook address. Since
 * pool pair addresses from DexScreener may be position managers or periphery
 * contracts rather than the PoolManager itself, we attempt multiple approaches:
 *
 * 1. Check if the pool address itself has hook permissions encoded (it may be
 *    the hook address directly in some configurations).
 * 2. Try calling common view functions on the pool address to extract the hook.
 * 3. Fall back to treating the pool address as a potential hook if it has code
 *    deployed and its lower bits suggest hook permissions.
 *
 * Returns the hook address if found, or null if we cannot determine it.
 */
async function resolveHookAddress(
  poolAddress: string,
  rpcUrl: string,
): Promise<string | null> {
  // Approach 1: Check if the pool address itself encodes hook permissions.
  // In V4, hook addresses must have specific bit patterns. If the lower 14
  // bits of the pool address have any set, it might be a hook address itself.
  const addrBigInt = BigInt(poolAddress);
  const lower14 = addrBigInt & 0x3FFFn; // mask for lower 14 bits

  if (lower14 !== 0n) {
    // The address has hook permission bits set — verify it has code deployed
    const code = await rpcGetCode(rpcUrl, poolAddress);
    if (code && code !== "0x" && code.length > 2) {
      return poolAddress;
    }
  }

  // Approach 2: Try calling a hookAddress() getter on the pool contract.
  // Some V4 periphery contracts expose this.
  // Function selector for `hookAddress()` = keccak256("hookAddress()")[:4]
  // = 0x58730040 (first 4 bytes)
  // Also try `hook()` = 0xdc2688ea
  const selectors = [
    "0x58730040", // hookAddress()
    "0xdc2688ea", // hook()
  ];

  for (const selector of selectors) {
    const result = await rpcCall(rpcUrl, poolAddress, selector);
    if (result && result.length >= 42) {
      // ABI-encoded address is 32 bytes (64 hex chars) + "0x" prefix
      // Extract the address from the last 40 hex chars of the 32-byte word
      const hex = result.replace("0x", "");
      if (hex.length >= 64) {
        const addrHex = "0x" + hex.slice(24, 64);
        // Verify it's not the zero address
        if (BigInt(addrHex) !== 0n) {
          return addrHex;
        }
      }
    }
  }

  return null;
}

/**
 * Analyze V4 hook permissions for discovered V4 pool addresses.
 *
 * Takes V4 pool addresses from DexScreener discovery, resolves hook addresses
 * via RPC, decodes permission bitmasks, and flags dangerous permissions.
 *
 * If V4 pools don't exist on the target chain or RPC calls fail, this
 * gracefully returns an empty result.
 *
 * @param v4Pools - V4 pool addresses discovered via DexScreener
 * @param chain   - Chain name or ID for RPC endpoint selection
 * @returns Aggregate V4 hook security analysis
 */
export async function analyzeV4Hooks(
  v4Pools: UniswapPool[],
  chain: string,
): Promise<V4HookScanResult> {
  const emptyResult: V4HookScanResult = {
    v4PoolsAnalyzed: 0,
    hooks: [],
    worstHookRiskScore: 0,
    summary: "No V4 pools found or V4 hook analysis not applicable",
  };

  if (v4Pools.length === 0) return emptyResult;

  const rpcUrl = getRpcEndpoint(chain);
  if (!rpcUrl) {
    return {
      ...emptyResult,
      summary: `No RPC endpoint configured for chain ${chain} — cannot analyze V4 hooks`,
    };
  }

  const hookAnalyses: V4HookAnalysis[] = [];

  // Analyze each V4 pool — resolve hook addresses and decode permissions
  for (const pool of v4Pools) {
    if (!pool.pairAddress) continue;

    try {
      const hookAddress = await resolveHookAddress(pool.pairAddress, rpcUrl);

      if (hookAddress) {
        const analysis = analyzeHookAddress(hookAddress, pool.pairAddress);
        hookAnalyses.push(analysis);
      } else {
        // Could not resolve hook address — still record the pool.
        // Treat the pool address itself as a potential hook and decode
        // its permission bits for informational purposes.
        const analysis = analyzeHookAddress(pool.pairAddress, pool.pairAddress);
        // Only include if it has any permissions (otherwise it's not a hook)
        if (analysis.enabledPermissions.length > 0) {
          hookAnalyses.push(analysis);
        }
      }
    } catch {
      // RPC failure for this pool — skip gracefully
      continue;
    }
  }

  const worstHookRiskScore = hookAnalyses.length > 0
    ? Math.max(...hookAnalyses.map((h) => h.hookRiskScore))
    : 0;

  // Build summary
  const summaryParts: string[] = [];
  summaryParts.push(`Analyzed ${v4Pools.length} V4 pool(s)`);

  if (hookAnalyses.length === 0) {
    summaryParts.push("No hook permission patterns detected in pool addresses");
  } else {
    summaryParts.push(`${hookAnalyses.length} hook(s) analyzed`);

    const noOpHooks = hookAnalyses.filter((h) => h.hasNoOpRugVector);
    if (noOpHooks.length > 0) {
      summaryParts.push(
        `WARNING: ${noOpHooks.length} hook(s) have BEFORE_SWAP_RETURNS_DELTA (NoOp rug-pull vector)`
      );
    }

    const dangerousHooks = hookAnalyses.filter((h) => h.dangerousPermissions.length > 0);
    if (dangerousHooks.length > 0) {
      summaryParts.push(
        `${dangerousHooks.length} hook(s) have HIGH or CRITICAL risk permissions`
      );
    }
  }

  return {
    v4PoolsAnalyzed: v4Pools.length,
    hooks: hookAnalyses,
    worstHookRiskScore,
    summary: summaryParts.join(". "),
  };
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
  v4HookScan?: V4HookScanResult,
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

  // ── V4 Hook Permission Risk Penalties ──
  if (v4HookScan && v4HookScan.hooks.length > 0) {
    const worstScore = v4HookScan.worstHookRiskScore;

    // Penalize based on the worst hook risk score found
    if (worstScore >= 80) {
      // CRITICAL: NoOp rug vector or extreme permission combination
      score = Math.max(score, 85);
      details.push(
        `V4 HOOK CRITICAL RISK (score ${worstScore}/100): ` +
        v4HookScan.summary,
      );
    } else if (worstScore >= 55) {
      // HIGH: multiple dangerous permissions
      score = Math.max(score, 60);
      details.push(
        `V4 hook HIGH risk (score ${worstScore}/100): ` +
        v4HookScan.summary,
      );
    } else if (worstScore >= 35) {
      // MEDIUM: at least one dangerous permission
      score = Math.max(score, 40);
      details.push(
        `V4 hook elevated risk (score ${worstScore}/100): ` +
        v4HookScan.summary,
      );
    } else if (worstScore > 0) {
      details.push(
        `V4 hook low risk (score ${worstScore}/100): ` +
        v4HookScan.summary,
      );
    }

    // Specific NoOp rug-pull flag — always flag this prominently
    const noOpHooks = v4HookScan.hooks.filter((h) => h.hasNoOpRugVector);
    if (noOpHooks.length > 0) {
      score = Math.max(score, 90);
      details.push(
        `DANGER: ${noOpHooks.length} V4 hook(s) have BEFORE_SWAP_RETURNS_DELTA enabled — ` +
        `this is the NoOp rug-pull attack vector where the hook can steal all swap input tokens. ` +
        `Do NOT trade through these pools without verifying the hook contract is audited.`,
      );
    }

    // Flag afterSwapReturnDelta and afterRemoveLiquidityReturnDelta
    const deltaHooks = v4HookScan.hooks.filter((h) =>
      h.enabledPermissions.some((p) =>
        p.name === "AFTER_SWAP_RETURNS_DELTA" ||
        p.name === "AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA",
      ),
    );
    if (deltaHooks.length > 0 && noOpHooks.length === 0) {
      // Only add if we didn't already flag NoOp (to avoid redundancy)
      score = Math.max(score, 55);
      const flagNames = new Set<string>();
      for (const h of deltaHooks) {
        for (const p of h.enabledPermissions) {
          if (p.name === "AFTER_SWAP_RETURNS_DELTA" || p.name === "AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA") {
            flagNames.add(p.name);
          }
        }
      }
      details.push(
        `V4 hook(s) use return-delta permissions (${[...flagNames].join(", ")}) — ` +
        `these can modify swap outputs or withdrawal amounts`,
      );
    }
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
 * Includes V4 hook permission security analysis: if V4 pools are discovered,
 * hook addresses are resolved via RPC and their permission bitmasks are decoded
 * to flag dangerous patterns (NoOp rug pulls, return-delta manipulation, etc.).
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

  // ── V4 Hook Security Analysis ──
  // If any V4 pools are found, analyze their hook permissions for risk
  let v4HookAnalysis: V4HookScanResult | undefined;
  const v4Pools = pools.filter((p) => p.version === "v4");
  if (v4Pools.length > 0) {
    try {
      v4HookAnalysis = await analyzeV4Hooks(v4Pools, chain);
    } catch {
      // Hook analysis failure should not block the rest of the scan
      v4HookAnalysis = {
        v4PoolsAnalyzed: v4Pools.length,
        hooks: [],
        worstHookRiskScore: 0,
        summary: "V4 hook analysis failed — could not query hook permissions",
      };
    }
  }

  const { score, detail } = computeUniswapRisk(
    pools,
    totalLiquidityUsd,
    routesViaUniswap,
    v4HookAnalysis,
  );

  return {
    hasUniswapPool: pools.length > 0,
    poolCount: pools.length,
    pools,
    totalLiquidityUsd,
    totalVolume24h,
    bestVersion,
    quoteUsesUniswapRouting: routesViaUniswap,
    v4HookAnalysis,
    riskScore: score,
    riskDetail: detail,
  };
}
