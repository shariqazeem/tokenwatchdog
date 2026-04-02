import { runJson, resolveChain } from "../utils/cli.js";
import type { TokenPriceInfo, QuoteResult } from "../utils/types.js";

/**
 * Get detailed token price info (price, volume, liquidity, holders, multi-timeframe changes).
 */
export async function getTokenPriceInfo(
  address: string,
  chain: string
): Promise<TokenPriceInfo | null> {
  const chainName = chain.toLowerCase();

  try {
    const raw = await runJson<any>(
      ["token", "price-info", "--address", address, "--chain", chainName]
    );

    // Response: { ok, data: [{ ... }] } — unwrap array
    const dataArr = Array.isArray(raw?.data) ? raw.data : [raw?.data ?? raw];
    const data = dataArr[0] ?? {};

    return {
      price: String(data?.price ?? "0"),
      marketCap: String(data?.marketCap ?? "0"),
      liquidity: String(data?.liquidity ?? "0"),
      holders: String(data?.holders ?? "0"),
      volume5M: String(data?.volume5M ?? "0"),
      volume1H: String(data?.volume1H ?? "0"),
      volume24H: String(data?.volume24H ?? "0"),
      txs5M: String(data?.txs5M ?? "0"),
      txs1H: String(data?.txs1H ?? "0"),
      txs24H: String(data?.txs24H ?? "0"),
      priceChange5M: String(data?.priceChange5M ?? "0"),
      priceChange1H: String(data?.priceChange1H ?? "0"),
      priceChange24H: String(data?.priceChange24H ?? "0"),
      circSupply: String(data?.circSupply ?? "0"),
      raw,
    };
  } catch {
    return null;
  }
}

/**
 * Get a swap quote to check honeypot status and price impact.
 * Uses USDC as the "from" token to simulate a buy.
 */
export async function getQuote(
  tokenAddress: string,
  chain: string,
  amountUsd = "100"
): Promise<QuoteResult | null> {
  const chainName = chain.toLowerCase();
  const chainId = resolveChain(chain);

  // USDC addresses per chain
  const usdcMap: Record<string, string> = {
    "196": "0x74b7f16337b8972027f6196a17a631ac6de26d22",   // X Layer
    "1":   "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",   // Ethereum
    "8453":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",   // Base
    "56":  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",   // BSC
    "42161":"0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // Arbitrum
  };
  const usdcAddress = usdcMap[chainId];
  if (!usdcAddress) return null;

  try {
    const raw = await runJson<any>(
      ["swap", "quote", "--from", usdcAddress, "--to", tokenAddress, "--readable-amount", amountUsd, "--chain", chainName]
    );

    // Response: { ok, data: [{ toToken, dexRouterList, ... }] }
    const dataArr = Array.isArray(raw?.data) ? raw.data : [raw?.data ?? raw];
    const data = dataArr[0] ?? {};

    // Top-level toToken has the final honeypot/tax for the destination token
    const toToken = data?.toToken ?? {};
    let isHoneyPot = toToken.isHoneyPot === true;
    let taxRate = String(toToken.taxRate ?? "0");

    // Also check each hop in dexRouterList for honeypot flags
    const routes = data?.dexRouterList ?? [];
    for (const route of routes) {
      const hopToken = route?.toToken ?? {};
      if (hopToken.isHoneyPot === true) isHoneyPot = true;
      if (Number(hopToken.taxRate ?? 0) > Number(taxRate)) taxRate = String(hopToken.taxRate);
    }

    return {
      fromTokenAmount: String(data?.fromTokenAmount ?? "0"),
      toTokenAmount: String(data?.toTokenAmount ?? "0"),
      priceImpactPercent: String(data?.priceImpactPercent ?? "0"),
      isHoneyPot,
      taxRate,
      estimateGasFee: String(data?.estimateGasFee ?? "0"),
      raw,
    };
  } catch {
    return null;
  }
}

/**
 * Get index price (manipulation-resistant, multi-source).
 */
export async function getIndexPrice(
  address: string,
  chain: string
): Promise<{ price: string; time: string } | null> {
  const chainName = chain.toLowerCase();

  try {
    const raw = await runJson<any>(
      ["market", "index", "--address", address, "--chain", chainName]
    );

    const dataArr = Array.isArray(raw?.data) ? raw.data : [raw?.data ?? raw];
    const data = dataArr[0] ?? {};
    return {
      price: String(data?.price ?? "0"),
      time: String(data?.time ?? ""),
    };
  } catch {
    return null;
  }
}
