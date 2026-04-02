"use client";

import { useState, useCallback } from "react";
import { Nav } from "../components/Nav";

interface PortfolioHolding {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  balance: string;
  balanceUsd: string;
  riskScore: number | null;
  riskLevel: string;
  riskSummary: string;
}

interface PortfolioResult {
  holdings: PortfolioHolding[];
  totalValueUsd: number;
  dangerCount: number;
  safeCount: number;
}

export default function PortfolioPage() {
  const [wallet, setWallet] = useState("0x6db686fe9e983b3bcafb6c42f370fd40aff38b8e");
  const [chain, setChain] = useState("xlayer");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PortfolioResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scanPortfolio = useCallback(async () => {
    if (!wallet.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/portfolio?wallet=${wallet.trim()}&chain=${chain}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Failed to scan portfolio");
    } finally {
      setLoading(false);
    }
  }, [wallet, chain]);

  const levelStyles: Record<string, { dot: string; bg: string; text: string }> = {
    SAFE: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
    CAUTION: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
    WARNING: { dot: "bg-orange-500", bg: "bg-orange-50", text: "text-orange-700" },
    DANGER: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
    CRITICAL: { dot: "bg-red-700", bg: "bg-red-100", text: "text-red-800" },
    UNKNOWN: { dot: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-500" },
  };

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
        <div className="mb-8">
          <h2 className="text-2xl font-semibold tracking-tight mb-1">Portfolio Guardian</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-5">
            Scan any wallet to see risk scores for every token holding
          </p>

          <div className="flex gap-3 max-w-2xl">
            <input
              type="text"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && scanPortfolio()}
              placeholder="0x wallet address..."
              className="flex-1 px-4 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-white placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent font-mono"
            />
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-white"
            >
              <option value="xlayer">X Layer</option>
              <option value="ethereum">Ethereum</option>
              <option value="base">Base</option>
              <option value="bsc">BSC</option>
            </select>
            <button
              onClick={scanPortfolio}
              disabled={loading || !wallet.trim()}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--foreground)] rounded-lg hover:bg-[#1e293b] disabled:opacity-40 transition-colors"
            >
              {loading ? "Scanning..." : "Scan Wallet"}
            </button>
          </div>
          {error && (
            <div className="mt-3 px-4 py-2.5 text-sm text-[var(--danger)] bg-[var(--danger-light)] rounded-lg border border-red-100 max-w-2xl">
              {error}
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <svg className="animate-spin h-8 w-8 text-[var(--accent)] mx-auto mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[var(--muted-foreground)] text-sm">Scanning portfolio holdings with risk analysis...</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-[var(--border)] rounded-xl p-4 bg-white/80 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Total Value</p>
                <p className="text-2xl font-bold tracking-tight">${result.totalValueUsd.toFixed(2)}</p>
              </div>
              <div className="border border-[var(--border)] rounded-xl p-4 bg-white/80 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Holdings</p>
                <p className="text-2xl font-bold tracking-tight">{result.holdings.length}</p>
              </div>
              <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50">
                <p className="text-[10px] uppercase tracking-wider text-emerald-600 mb-1">Safe</p>
                <p className="text-2xl font-bold tracking-tight text-emerald-700">{result.safeCount}</p>
              </div>
              <div className="border border-red-200 rounded-xl p-4 bg-red-50/50">
                <p className="text-[10px] uppercase tracking-wider text-red-600 mb-1">Dangerous</p>
                <p className="text-2xl font-bold tracking-tight text-red-700">{result.dangerCount}</p>
              </div>
            </div>

            {/* Holdings List */}
            {result.holdings.length === 0 ? (
              <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">
                No token holdings found in this wallet.
              </div>
            ) : (
              <div className="space-y-3">
                {result.holdings
                  .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
                  .map((h, i) => {
                    const s = levelStyles[h.riskLevel] ?? levelStyles.UNKNOWN;
                    const isDanger = (h.riskScore ?? 0) >= 60;
                    return (
                      <div
                        key={`${h.tokenContractAddress}-${i}`}
                        className={`border rounded-xl p-5 transition-colors ${
                          isDanger ? "border-red-200 bg-red-50/30" : "border-[var(--border)] bg-white hover:border-[var(--muted-foreground)]/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center`}>
                              <span className={`text-sm font-bold ${s.text}`}>
                                {h.riskScore ?? "?"}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{h.tokenSymbol}</span>
                                <span className="text-sm text-[var(--muted-foreground)]">{h.tokenName}</span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${s.bg} ${s.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                  {h.riskLevel}
                                </span>
                              </div>
                              <p className="text-xs text-[var(--muted-foreground)] font-mono mt-0.5">
                                {h.tokenContractAddress.slice(0, 20)}...
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">${parseFloat(h.balanceUsd).toFixed(2)}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">{parseFloat(h.balance).toFixed(4)} tokens</p>
                          </div>
                        </div>

                        {isDanger && h.riskSummary && (
                          <div className="mt-3 px-4 py-2.5 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-start gap-2">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              <div>
                                <p className="text-xs font-semibold text-red-800">Danger — Immediate action recommended</p>
                                <p className="text-xs text-red-700 mt-0.5">{h.riskSummary}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!result && !loading && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--muted)] mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <p className="text-[var(--muted-foreground)] text-sm">
              Enter a wallet address to scan all holdings for risk
            </p>
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
