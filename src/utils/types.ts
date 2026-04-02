// ── Token Watchdog Types ──

export interface TokenQuery {
  address: string;
  chain: string; // chain name or ID (e.g., "xlayer", "196")
}

// ── Security Scan ──

export interface SecurityScanResult {
  chainIndex: string;
  tokenContractAddress: string;
  isRiskToken: boolean;
  buyTaxes: string;
  sellTaxes: string;
  isHoneyPot?: boolean;
  isChainSupported: boolean;
  raw?: unknown;
}

// ── Trenches (Meme/Dev Analysis) ──

export interface DevInfo {
  devAddress: string;
  fundingAddress: string;
  totalTokens: number;
  rugPullCount: number;
  migratedCount: number;
  goldenGemCount: number;
  devHoldingPercent: number;
  raw?: unknown;
}

export interface BundleInfo {
  bundlerAthPercent: number;
  totalBundlers: number;
  bundledValueNative: string;
  bundledTokenAmount: string;
  raw?: unknown;
}

// ── Token Info ──

export interface TokenAdvancedInfo {
  tokenName: string;
  tokenSymbol: string;
  tokenContractAddress: string;
  chainIndex: string;
  riskControlLevel: number; // 0-5
  tokenTags: string[]; // honeypot, lowLiquidity, etc.
  top10HoldPercent: number;
  devHoldingPercent: number;
  bundleHoldingPercent: number;
  communityRecognized: boolean;
  raw?: unknown;
}

export interface TokenHolder {
  holderWalletAddress: string;
  holdAmount: string;
  holdPercent?: number;
}

export interface ClusterOverview {
  clusterConcentration: "Low" | "Medium" | "High";
  rugPullPercent: number;
  holderNewAddressPercent: number;
  raw?: unknown;
}

// ── Market Data ──

export interface TokenPriceInfo {
  price: string;
  marketCap: string;
  liquidity: string;
  holders: string;
  volume5M: string;
  volume1H: string;
  volume24H: string;
  txs5M: string;
  txs1H: string;
  txs24H: string;
  priceChange5M: string;
  priceChange1H: string;
  priceChange24H: string;
  circSupply: string;
  raw?: unknown;
}

export interface QuoteResult {
  fromTokenAmount: string;
  toTokenAmount: string;
  priceImpactPercent: string;
  isHoneyPot: boolean;
  taxRate: string;
  estimateGasFee: string;
  raw?: unknown;
}

// ── Uniswap Analysis ──

export interface UniswapAnalysisResult {
  hasUniswapPool: boolean;
  poolCount: number;
  totalLiquidityUsd: number;
  totalVolume24h: number;
  bestVersion: string;        // "v2" | "v3" | "v4" | "none"
  quoteUsesUniswapRouting: boolean;
  riskScore: number;          // 0-100
  riskDetail: string;
}

// ── Composite Risk Score ──

export type RiskLevel = "SAFE" | "CAUTION" | "WARNING" | "DANGER" | "CRITICAL";

export interface RiskFactor {
  name: string;
  score: number;     // 0-100 contribution
  weight: number;    // 0-1 weight
  detail: string;    // human-readable explanation
}

export interface RiskReport {
  token: TokenQuery;
  tokenName: string;
  tokenSymbol: string;
  overallScore: number;   // 0-100 (higher = more dangerous)
  level: RiskLevel;
  factors: RiskFactor[];
  summary: string;        // plain-English summary
  recommendation: string; // action recommendation
  timestamp: string;
  raw: {
    security?: SecurityScanResult;
    devInfo?: DevInfo;
    bundleInfo?: BundleInfo;
    advancedInfo?: TokenAdvancedInfo;
    priceInfo?: TokenPriceInfo;
    clusterOverview?: ClusterOverview;
    holders?: TokenHolder[];
    quote?: QuoteResult;
    uniswap?: UniswapAnalysisResult;
  };
}

// ── Swap Execution ──

export interface SafeSwapRequest {
  fromToken: string;
  toToken: string;
  amount: string;
  chain: string;
  wallet: string;
  maxRiskScore?: number; // default 60
  slippage?: string;
}

export interface SafeSwapResult {
  allowed: boolean;
  riskReport: RiskReport;
  swapTxHash?: string;
  fromAmount?: string;
  toAmount?: string;
  simulationPassed?: boolean;
  revertReason?: string;
  error?: string;
}
