"use client";

import { useState, useEffect, useCallback } from "react";
import { Nav } from "../components/Nav";
import Link from "next/link";

interface TrendingToken {
  tokenSymbol: string;
  tokenName: string;
  tokenContractAddress: string;
  price: string;
  marketCap: string;
  volume: string;
  change: string;
  liquidity: string;
  holders: string;
  riskScore: number | null;
  riskLevel: string;
  riskSummary: string;
}

export default function TrendingPage() {
  const [tokens, setTokens] = useState<TrendingToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [chain, setChain] = useState("xlayer");
  const [error, setError] = useState<string | null>(null);

  const [scanningCount, setScanningCount] = useState(0);

  // Load tokens fast, then scan each for risk scores progressively
  const fetchTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTokens([]);
    try {
      const res = await fetch(`/api/trending?chain=${chain}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      const allTokens: TrendingToken[] = data.tokens ?? [];
      setTokens(allTokens);
      setLoading(false);

      // Progressively scan each token for risk scores (3 at a time)
      const BATCH_SIZE = 3;
      for (let i = 0; i < allTokens.length; i += BATCH_SIZE) {
        const batch = allTokens.slice(i, i + BATCH_SIZE);
        setScanningCount(i + batch.length);
        await Promise.all(
          batch.map(async (t) => {
            if (!t.tokenContractAddress) return;
            try {
              const scanRes = await fetch(`/api/scan?address=${t.tokenContractAddress}&chain=${chain}`);
              const report = await scanRes.json();
              if (!report.error) {
                setTokens((prev) =>
                  prev.map((tok) =>
                    tok.tokenContractAddress === t.tokenContractAddress
                      ? { ...tok, riskScore: report.overallScore, riskLevel: report.level, riskSummary: report.summary }
                      : tok
                  )
                );
              }
            } catch {}
          })
        );
      }
      setScanningCount(0);
    } catch {
      setError("Failed to fetch trending tokens");
    } finally {
      setLoading(false);
      setScanningCount(0);
    }
  }, [chain]);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  const levelDot: Record<string, string> = {
    SAFE: "bg-emerald-500",
    CAUTION: "bg-amber-500",
    WARNING: "bg-orange-500",
    DANGER: "bg-red-500",
    CRITICAL: "bg-red-700",
    UNKNOWN: "bg-gray-400",
  };

  const levelBg: Record<string, string> = {
    SAFE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CAUTION: "bg-amber-50 text-amber-700 border-amber-200",
    WARNING: "bg-orange-50 text-orange-700 border-orange-200",
    DANGER: "bg-red-50 text-red-700 border-red-200",
    CRITICAL: "bg-red-100 text-red-800 border-red-300",
    UNKNOWN: "bg-gray-50 text-gray-500 border-gray-200",
  };

  function fmt(val: string | undefined, prefix = "$") {
    const n = parseFloat(val || "0");
    if (n >= 1e9) return `${prefix}${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${prefix}${(n / 1e3).toFixed(1)}K`;
    if (n >= 1) return `${prefix}${n.toFixed(2)}`;
    if (n > 0) return `${prefix}${n.toPrecision(3)}`;
    return `${prefix}0`;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b border-[var(--border)] bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--foreground)] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Token Watchdog</h1>
              <p className="text-xs text-[var(--muted-foreground)]">Rug pull protection for X Layer</p>
            </div>
          </div>
          <Nav />
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Trending Tokens</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Hot tokens on X Layer with live risk scores</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-white"
            >
              <option value="xlayer">X Layer</option>
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
              <option value="base">Base</option>
            </select>
            <button
              onClick={fetchTrending}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--foreground)] rounded-lg hover:bg-[#1e293b] disabled:opacity-40 transition-colors"
            >
              {loading ? "Loading..." : scanningCount > 0 ? `Scanning ${scanningCount}/${tokens.length}...` : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 text-sm text-[var(--danger)] bg-[var(--danger-light)] rounded-lg border border-red-100 mb-6">
            {error}
          </div>
        )}

        {loading && !tokens.length ? (
          <div className="text-center py-20">
            <svg className="animate-spin h-8 w-8 text-[var(--accent)] mx-auto mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[var(--muted-foreground)] text-sm">Scanning trending tokens with risk analysis...</p>
            <p className="text-[var(--muted-foreground)] text-xs mt-1">This may take a moment</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tokens.map((token, i) => (
              <div
                key={token.tokenContractAddress || i}
                className="border border-[var(--border)] rounded-xl p-5 hover:border-[var(--muted-foreground)]/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{token.tokenSymbol}</span>
                      <span className="text-sm text-[var(--muted-foreground)]">{token.tokenName}</span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] font-mono mt-0.5 truncate max-w-[240px]">
                      {token.tokenContractAddress}
                    </p>
                  </div>
                  {token.riskScore !== null ? (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${levelBg[token.riskLevel] ?? levelBg.UNKNOWN}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${levelDot[token.riskLevel] ?? levelDot.UNKNOWN}`} />
                      {token.riskScore}/100
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 text-xs text-[var(--muted-foreground)] bg-[var(--muted)] rounded-full border border-[var(--border)]">
                      Scanning...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Price</p>
                    <p className="text-sm font-medium">{fmt(token.price)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">MCap</p>
                    <p className="text-sm font-medium">{fmt(token.marketCap)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Volume 24h</p>
                    <p className="text-sm font-medium">{fmt(token.volume)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Liquidity</p>
                    <p className="text-sm font-medium">{fmt(token.liquidity)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Holders</p>
                    <p className="text-sm font-medium">{parseInt(token.holders || "0").toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">24h Change</p>
                    <p className={`text-sm font-medium ${parseFloat(token.change || "0") >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {parseFloat(token.change || "0") >= 0 ? "+" : ""}{parseFloat(token.change || "0").toFixed(2)}%
                    </p>
                  </div>
                </div>

                {token.riskScore !== null && (
                  <div className="pt-3 border-t border-[var(--border)]">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed flex-1 mr-3">
                        {token.riskSummary?.split(".").slice(0, 2).join(".") + "."}
                      </p>
                      <Link
                        href={`/?address=${token.tokenContractAddress}&chain=${chain}`}
                        className="text-xs font-medium text-[var(--accent)] hover:underline whitespace-nowrap"
                      >
                        Full Report →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--border)] py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Token Watchdog &middot; Built for OKX Build X Hackathon</span>
          <span>X Layer &middot; OnchainOS &middot; Skills Arena</span>
        </div>
      </footer>
    </div>
  );
}
