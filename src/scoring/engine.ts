import type {
  RiskFactor,
  RiskLevel,
  RiskReport,
  SecurityScanResult,
  DevInfo,
  BundleInfo,
  TokenAdvancedInfo,
  TokenPriceInfo,
  ClusterOverview,
  TokenHolder,
  QuoteResult,
  UniswapAnalysisResult,
  TokenQuery,
} from "../utils/types.js";

// ── Risk Factor Weights (must sum to 1.0) ──

const WEIGHTS = {
  honeypot:           0.18,  // Is it a honeypot? Instant kill.
  taxRate:            0.09,  // Hidden buy/sell taxes
  holderConcentration:0.13,  // Top wallets own too much
  devReputation:      0.13,  // Deployer rug history
  liquidityDepth:     0.09,  // Can you actually sell?
  priceManipulation:  0.09,  // Wash trading, volume anomalies
  bundleDetection:    0.09,  // Coordinated launch buying
  communityVerified:  0.05,  // Listed on major exchanges?
  clusterRisk:        0.05,  // Holder cluster concentration
  uniswapPresence:    0.10,  // Uniswap pool presence & liquidity depth
} as const;

// ── Individual Scorers (each returns 0-100, higher = more dangerous) ──

function scoreHoneypot(security: SecurityScanResult | undefined, quote: QuoteResult | undefined): RiskFactor {
  let score = 0;
  const details: string[] = [];

  if (security?.isHoneyPot || quote?.isHoneyPot) {
    score = 100;
    details.push("HONEYPOT DETECTED — you cannot sell this token");
  } else if (security?.isRiskToken) {
    score = 70;
    details.push("Flagged as risk token by OKX security");
  }

  if (security && security.buyTaxes === "unknown") {
    score = Math.max(score, 50);
    details.push("Security scan failed — could not verify safety");
  }

  return {
    name: "Honeypot Detection",
    score,
    weight: WEIGHTS.honeypot,
    detail: details.length ? details.join(". ") : "No honeypot indicators detected",
  };
}

function scoreTaxRate(security: SecurityScanResult | undefined, quote: QuoteResult | undefined): RiskFactor {
  const buyTax = Math.max(
    parseFloat(security?.buyTaxes ?? "0") || 0,
    parseFloat(quote?.taxRate ?? "0") || 0
  ) * 100; // convert from 0-1 to percentage
  const sellTax = (parseFloat(security?.sellTaxes ?? "0") || 0) * 100;
  const maxTax = Math.max(buyTax, sellTax);

  let score = 0;
  let detail = "";

  if (maxTax >= 50) {
    score = 100;
    detail = `Extreme tax rate: buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}% — effectively a rug`;
  } else if (maxTax >= 20) {
    score = 80;
    detail = `Very high tax: buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%`;
  } else if (maxTax >= 10) {
    score = 50;
    detail = `Elevated tax: buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%`;
  } else if (maxTax >= 3) {
    score = 20;
    detail = `Minor tax: buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%`;
  } else {
    detail = "No significant buy/sell tax detected";
  }

  return { name: "Tax Rate", score, weight: WEIGHTS.taxRate, detail };
}

function scoreHolderConcentration(
  advanced: TokenAdvancedInfo | undefined,
  holders: TokenHolder[],
  priceInfo: TokenPriceInfo | undefined
): RiskFactor {
  const top10 = advanced?.top10HoldPercent ?? 0;
  const totalHolders = parseInt(priceInfo?.holders ?? "0");

  let score = 0;
  const details: string[] = [];

  // Top 10 holder concentration
  if (top10 >= 80) {
    score = 95;
    details.push(`Top 10 wallets hold ${top10.toFixed(1)}% of supply — extreme concentration`);
  } else if (top10 >= 60) {
    score = 70;
    details.push(`Top 10 wallets hold ${top10.toFixed(1)}% — high concentration`);
  } else if (top10 >= 40) {
    score = 40;
    details.push(`Top 10 wallets hold ${top10.toFixed(1)}% — moderate concentration`);
  } else {
    details.push(`Top 10 wallets hold ${top10.toFixed(1)}% — reasonable distribution`);
  }

  // Very few holders
  if (totalHolders > 0 && totalHolders < 50) {
    score = Math.max(score, 70);
    details.push(`Only ${totalHolders} holders — very early/suspicious`);
  } else if (totalHolders > 0 && totalHolders < 200) {
    score = Math.max(score, 40);
    details.push(`${totalHolders} holders — still early`);
  }

  return {
    name: "Holder Concentration",
    score,
    weight: WEIGHTS.holderConcentration,
    detail: details.join(". "),
  };
}

function scoreDevReputation(devInfo: DevInfo | undefined, advanced: TokenAdvancedInfo | undefined): RiskFactor {
  if (!devInfo && !advanced) {
    return {
      name: "Developer Reputation",
      score: 30,
      weight: WEIGHTS.devReputation,
      detail: "Developer info unavailable — unable to verify",
    };
  }

  let score = 0;
  const details: string[] = [];

  if (devInfo) {
    const { totalTokens, rugPullCount, devHoldingPercent } = devInfo;

    // Rug pull history
    if (rugPullCount > 0) {
      const rugRate = totalTokens > 0 ? rugPullCount / totalTokens : 1;
      if (rugRate >= 0.5) {
        score = 100;
        details.push(`SERIAL RUGGER: ${rugPullCount}/${totalTokens} tokens rugged (${(rugRate * 100).toFixed(0)}% rug rate)`);
      } else {
        score = 70 + rugPullCount * 5;
        details.push(`Developer rugged ${rugPullCount} of ${totalTokens} previous tokens`);
      }
    } else if (totalTokens > 10) {
      score = Math.max(score, 30);
      details.push(`Developer launched ${totalTokens} tokens — prolific deployer`);
    }

    // Dev holding
    if (devHoldingPercent >= 20) {
      score = Math.max(score, 60);
      details.push(`Developer still holds ${devHoldingPercent.toFixed(1)}% of supply`);
    } else if (devHoldingPercent >= 5) {
      score = Math.max(score, 20);
      details.push(`Developer holds ${devHoldingPercent.toFixed(1)}%`);
    }
  }

  // Risk level from advanced info
  if (advanced && advanced.riskControlLevel >= 4) {
    score = Math.max(score, 80);
    details.push(`OKX risk level: ${advanced.riskControlLevel}/5`);
  }

  if (advanced?.devHoldingPercent && advanced.devHoldingPercent >= 20) {
    score = Math.max(score, 60);
    details.push(`Dev holding ${advanced.devHoldingPercent.toFixed(1)}% via advanced info`);
  }

  return {
    name: "Developer Reputation",
    score: Math.min(score, 100),
    weight: WEIGHTS.devReputation,
    detail: details.length ? details.join(". ") : "Developer appears clean",
  };
}

function scoreLiquidity(priceInfo: TokenPriceInfo | undefined, quote: QuoteResult | undefined): RiskFactor {
  let score = 0;
  const details: string[] = [];

  const liquidity = parseFloat(priceInfo?.liquidity ?? "0");
  const marketCap = parseFloat(priceInfo?.marketCap ?? "0");
  const priceImpact = Math.abs(parseFloat(quote?.priceImpactPercent ?? "0"));

  // Absolute liquidity
  if (liquidity < 1000) {
    score = 90;
    details.push(`Liquidity is only $${liquidity.toFixed(0)} — effectively untradeable`);
  } else if (liquidity < 10_000) {
    score = 60;
    details.push(`Low liquidity: $${(liquidity / 1000).toFixed(1)}K`);
  } else if (liquidity < 50_000) {
    score = 30;
    details.push(`Moderate liquidity: $${(liquidity / 1000).toFixed(1)}K`);
  } else {
    details.push(`Good liquidity: $${(liquidity / 1000).toFixed(1)}K`);
  }

  // Liquidity vs market cap ratio
  if (marketCap > 0 && liquidity > 0) {
    const ratio = liquidity / marketCap;
    if (ratio < 0.01) {
      score = Math.max(score, 70);
      details.push(`Liquidity/MCap ratio ${(ratio * 100).toFixed(2)}% — extremely thin`);
    }
  }

  // Price impact from quote
  if (priceImpact > 10) {
    score = Math.max(score, 80);
    details.push(`${priceImpact.toFixed(1)}% price impact on $100 trade — illiquid`);
  } else if (priceImpact > 5) {
    score = Math.max(score, 50);
    details.push(`${priceImpact.toFixed(1)}% price impact — below average liquidity`);
  }

  return {
    name: "Liquidity Depth",
    score: Math.min(score, 100),
    weight: WEIGHTS.liquidityDepth,
    detail: details.join(". "),
  };
}

function scorePriceManipulation(priceInfo: TokenPriceInfo | undefined): RiskFactor {
  if (!priceInfo) {
    return {
      name: "Price Manipulation",
      score: 30,
      weight: WEIGHTS.priceManipulation,
      detail: "Price data unavailable",
    };
  }

  let score = 0;
  const details: string[] = [];

  const change5M = Math.abs(parseFloat(priceInfo.priceChange5M));
  const change1H = Math.abs(parseFloat(priceInfo.priceChange1H));
  const vol5M = parseFloat(priceInfo.volume5M);
  const txs5M = parseInt(priceInfo.txs5M);

  // Extreme short-term price swings
  if (change5M > 30) {
    score = 80;
    details.push(`${change5M.toFixed(1)}% price change in 5 minutes — extreme volatility`);
  } else if (change5M > 10) {
    score = 40;
    details.push(`${change5M.toFixed(1)}% change in 5 minutes`);
  }

  // Wash trading signal: high volume but very few transactions
  if (vol5M > 10_000 && txs5M > 0 && txs5M < 3) {
    score = Math.max(score, 70);
    details.push(`$${(vol5M / 1000).toFixed(1)}K volume in 5min but only ${txs5M} txns — possible wash trading`);
  }

  // Extreme 1h change
  if (change1H > 100) {
    score = Math.max(score, 60);
    details.push(`${change1H.toFixed(0)}% change in 1 hour`);
  }

  if (!details.length) details.push("No obvious manipulation patterns");

  return {
    name: "Price Manipulation",
    score: Math.min(score, 100),
    weight: WEIGHTS.priceManipulation,
    detail: details.join(". "),
  };
}

function scoreBundleDetection(bundleInfo: BundleInfo | undefined, advanced: TokenAdvancedInfo | undefined): RiskFactor {
  let score = 0;
  const details: string[] = [];

  if (bundleInfo) {
    const { bundlerAthPercent, totalBundlers } = bundleInfo;
    if (bundlerAthPercent >= 30) {
      score = 90;
      details.push(`Bundlers held up to ${bundlerAthPercent.toFixed(1)}% of supply at peak — coordinated launch buy`);
    } else if (bundlerAthPercent >= 10) {
      score = 50;
      details.push(`Bundler peak holding: ${bundlerAthPercent.toFixed(1)}%`);
    }
    if (totalBundlers > 10) {
      score = Math.max(score, 40);
      details.push(`${totalBundlers} bundlers detected`);
    }
  }

  if (advanced?.bundleHoldingPercent && advanced.bundleHoldingPercent >= 10) {
    score = Math.max(score, 50);
    details.push(`Bundle wallets currently hold ${advanced.bundleHoldingPercent.toFixed(1)}%`);
  }

  if (!details.length) details.push(bundleInfo ? "No significant bundler activity" : "Bundle data unavailable");

  return {
    name: "Bundle Detection",
    score: Math.min(score, 100),
    weight: WEIGHTS.bundleDetection,
    detail: details.join(". "),
  };
}

function scoreCommunityVerified(advanced: TokenAdvancedInfo | undefined): RiskFactor {
  const verified = advanced?.communityRecognized ?? false;
  return {
    name: "Community Verified",
    score: verified ? 0 : 50,
    weight: WEIGHTS.communityVerified,
    detail: verified
      ? "Token is listed on major exchanges or community verified"
      : "Token is NOT community recognized — unverified",
  };
}

function scoreClusterRisk(cluster: ClusterOverview | undefined): RiskFactor {
  if (!cluster) {
    return {
      name: "Cluster Risk",
      score: 20,
      weight: WEIGHTS.clusterRisk,
      detail: "Cluster data unavailable",
    };
  }

  let score = 0;
  const details: string[] = [];

  if (cluster.clusterConcentration === "High") {
    score = 70;
    details.push("High holder cluster concentration — related wallets hold large portion");
  } else if (cluster.clusterConcentration === "Medium") {
    score = 30;
    details.push("Medium cluster concentration");
  } else {
    details.push("Low cluster concentration — healthy distribution");
  }

  if (cluster.rugPullPercent > 30) {
    score = Math.max(score, 80);
    details.push(`${cluster.rugPullPercent.toFixed(0)}% rug pull probability`);
  }

  if (cluster.holderNewAddressPercent > 70) {
    score = Math.max(score, 50);
    details.push(`${cluster.holderNewAddressPercent.toFixed(0)}% of holders are new addresses — bot activity`);
  }

  return {
    name: "Cluster Risk",
    score: Math.min(score, 100),
    weight: WEIGHTS.clusterRisk,
    detail: details.join(". "),
  };
}

function scoreUniswapPresence(uniswap: UniswapAnalysisResult | undefined): RiskFactor {
  if (!uniswap) {
    return {
      name: "Uniswap Presence",
      score: 30,
      weight: WEIGHTS.uniswapPresence,
      detail: "Uniswap analysis unavailable — could not verify DEX presence",
    };
  }

  return {
    name: "Uniswap Presence",
    score: uniswap.riskScore,
    weight: WEIGHTS.uniswapPresence,
    detail: uniswap.riskDetail,
  };
}

// ── Level Mapping ──

function riskLevel(score: number): RiskLevel {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "DANGER";
  if (score >= 40) return "WARNING";
  if (score >= 20) return "CAUTION";
  return "SAFE";
}

function generateSummary(score: number, level: RiskLevel, factors: RiskFactor[], tokenSymbol: string): string {
  const topRisks = factors
    .filter(f => f.score * f.weight > 5)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3);

  const riskDescriptions = topRisks.map(f => f.detail).join(". ");

  switch (level) {
    case "CRITICAL":
      return `CRITICAL (${score}/100): ${tokenSymbol} is extremely dangerous. ${riskDescriptions}. DO NOT BUY.`;
    case "DANGER":
      return `DANGER (${score}/100): ${tokenSymbol} has serious red flags. ${riskDescriptions}. Strongly advise against buying.`;
    case "WARNING":
      return `WARNING (${score}/100): ${tokenSymbol} has notable risks. ${riskDescriptions}. Proceed with extreme caution.`;
    case "CAUTION":
      return `CAUTION (${score}/100): ${tokenSymbol} has minor concerns. ${riskDescriptions}. Moderate risk.`;
    case "SAFE":
      return `SAFE (${score}/100): ${tokenSymbol} passes safety checks. No major red flags detected.`;
  }
}

function generateRecommendation(score: number, level: RiskLevel): string {
  switch (level) {
    case "CRITICAL":
      return "DO NOT BUY. This token exhibits critical risk indicators. Any investment is very likely to result in total loss.";
    case "DANGER":
      return "AVOID. Multiple serious risk factors detected. Look for safer alternatives.";
    case "WARNING":
      return "HIGH RISK. Only consider with very small position size and immediate exit plan.";
    case "CAUTION":
      return "MODERATE RISK. Acceptable for risk-tolerant positions. Set stop-losses.";
    case "SAFE":
      return "LOW RISK. Token appears safe for trading. Standard position sizing appropriate.";
  }
}

// ── Main Scoring Function ──

export function computeRiskScore(input: {
  token: TokenQuery;
  tokenName: string;
  tokenSymbol: string;
  security?: SecurityScanResult;
  devInfo?: DevInfo | null;
  bundleInfo?: BundleInfo | null;
  advancedInfo?: TokenAdvancedInfo | null;
  priceInfo?: TokenPriceInfo | null;
  clusterOverview?: ClusterOverview | null;
  holders?: TokenHolder[];
  quote?: QuoteResult | null;
  uniswap?: UniswapAnalysisResult | null;
}): RiskReport {
  const factors: RiskFactor[] = [
    scoreHoneypot(input.security, input.quote ?? undefined),
    scoreTaxRate(input.security, input.quote ?? undefined),
    scoreHolderConcentration(input.advancedInfo ?? undefined, input.holders ?? [], input.priceInfo ?? undefined),
    scoreDevReputation(input.devInfo ?? undefined, input.advancedInfo ?? undefined),
    scoreLiquidity(input.priceInfo ?? undefined, input.quote ?? undefined),
    scorePriceManipulation(input.priceInfo ?? undefined),
    scoreBundleDetection(input.bundleInfo ?? undefined, input.advancedInfo ?? undefined),
    scoreCommunityVerified(input.advancedInfo ?? undefined),
    scoreClusterRisk(input.clusterOverview ?? undefined),
    scoreUniswapPresence(input.uniswap ?? undefined),
  ];

  // Weighted average
  const overallScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  // Honeypot override: if confirmed honeypot, force CRITICAL
  const honeypotFactor = factors.find(f => f.name === "Honeypot Detection");
  const finalScore = (honeypotFactor && honeypotFactor.score === 100) ? Math.max(overallScore, 95) : overallScore;

  const level = riskLevel(finalScore);

  return {
    token: input.token,
    tokenName: input.tokenName,
    tokenSymbol: input.tokenSymbol,
    overallScore: finalScore,
    level,
    factors,
    summary: generateSummary(finalScore, level, factors, input.tokenSymbol),
    recommendation: generateRecommendation(finalScore, level),
    timestamp: new Date().toISOString(),
    raw: {
      security: input.security,
      devInfo: input.devInfo ?? undefined,
      bundleInfo: input.bundleInfo ?? undefined,
      advancedInfo: input.advancedInfo ?? undefined,
      priceInfo: input.priceInfo ?? undefined,
      clusterOverview: input.clusterOverview ?? undefined,
      holders: input.holders,
      quote: input.quote ?? undefined,
      uniswap: input.uniswap ?? undefined,
    },
  };
}
