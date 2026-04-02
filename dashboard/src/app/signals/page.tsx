"use client";

import { useState, useEffect, useCallback } from "react";
import { Nav } from "../components/Nav";

interface Trade {
  txHash: string;
  txHashUrl: string;
  walletAddress: string;
  tokenSymbol: string;
  tokenContractAddress: string;
  tokenPrice: string;
  tradeType: string; // "1" = buy, "2" = sell
  tradeTime: string;
  realizedPnlUsd: string;
  amountUsd: string;
  walletType: string;
}

export default function SignalsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [chain, setChain] = useState("xlayer");
  const [type, setType] = useState("smart_money");
  const [error, setError] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/signals?chain=${chain}&type=${type}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setTrades(data.trades ?? []);
      }
    } catch {
      setError("Failed to fetch signals");
    } finally {
      setLoading(false);
    }
  }, [chain, type]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  function timeAgo(ts: string) {
    const ms = Date.now() - (parseInt(ts) || new Date(ts).getTime());
    if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  }

  function shortAddr(addr: string) {
    if (!addr || addr.length < 12) return addr || "—";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  function fmtUsd(val: string | undefined) {
    const n = parseFloat(val || "0");
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    if (n > 0) return `$${n.toFixed(2)}`;
    return "—";
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
            <h2 className="text-2xl font-semibold tracking-tight">Smart Money Signals</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Real-time whale and KOL trading activity</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-white"
            >
              <option value="smart_money">Smart Money</option>
              <option value="kol">KOL / Influencers</option>
            </select>
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
              onClick={fetchSignals}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--foreground)] rounded-lg hover:bg-[#1e293b] disabled:opacity-40 transition-colors"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 text-sm text-[var(--danger)] bg-[var(--danger-light)] rounded-lg border border-red-100 mb-6">
            {error}
          </div>
        )}

        {loading && !trades.length ? (
          <div className="text-center py-20">
            <svg className="animate-spin h-8 w-8 text-[var(--accent)] mx-auto mb-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[var(--muted-foreground)] text-sm">Fetching smart money activity...</p>
          </div>
        ) : trades.length === 0 && !loading ? (
          <div className="text-center py-20">
            <p className="text-[var(--muted-foreground)] text-sm">No recent signals on this chain. Try Ethereum or Solana.</p>
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Time</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Token</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Wallet</th>
                  <th className="text-right px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Amount</th>
                  <th className="text-right px-4 py-2.5 font-medium text-[var(--muted-foreground)]">PnL</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade, i) => (
                  <tr key={`${trade.txHash || i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)] transition-colors">
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                      {trade.tradeTime ? timeAgo(trade.tradeTime) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                        trade.tradeType === "1" || trade.tradeType?.toLowerCase() === "buy"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}>
                        {trade.tradeType === "1" || trade.tradeType?.toLowerCase() === "buy" ? "BUY" : "SELL"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{trade.tokenSymbol || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--muted-foreground)]">
                      {shortAddr(trade.walletAddress)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {fmtUsd(trade.amountUsd)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {trade.realizedPnlUsd && parseFloat(trade.realizedPnlUsd) !== 0 ? (
                        <span className={parseFloat(trade.realizedPnlUsd) > 0 ? "text-emerald-600" : "text-red-600"}>
                          {parseFloat(trade.realizedPnlUsd) > 0 ? "+" : ""}{fmtUsd(trade.realizedPnlUsd)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
