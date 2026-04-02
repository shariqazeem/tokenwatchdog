"use client";

import { useState, useCallback, useEffect } from "react";
import { RiskGauge } from "./components/RiskGauge";
import { FactorCard } from "./components/FactorCard";
import { ScanHistory } from "./components/ScanHistory";
import { Nav } from "./components/Nav";

interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

interface ScanResult {
  tokenSymbol: string;
  tokenName: string;
  chain: string;
  address: string;
  overallScore: number;
  level: string;
  summary: string;
  recommendation: string;
  factors: RiskFactor[];
  timestamp: string;
}

const DEFAULT_WALLET = "0x6db686fe9e983b3bcafb6c42f370fd40aff38b8e";

export default function Home() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("xlayer");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Wallet & trading state
  const [walletAddress, setWalletAddress] = useState(DEFAULT_WALLET);
  const [walletConnected, setWalletConnected] = useState(true);
  const [buyAmount, setBuyAmount] = useState("100");
  const [buying, setBuying] = useState(false);
  const [buyResult, setBuyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showWalletConfig, setShowWalletConfig] = useState(false);

  // Read address from URL params (for "Full Report" links from trending page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addr = params.get("address");
    const ch = params.get("chain");
    if (addr) {
      setAddress(addr);
      if (ch) setChain(ch);
    }
  }, []);

  const handleScan = useCallback(async () => {
    if (!address.trim()) return;
    setScanning(true);
    setError(null);
    setResult(null);
    setBuyResult(null);

    try {
      const res = await fetch(`/api/scan?address=${encodeURIComponent(address.trim())}&chain=${chain}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        setHistory((prev) => [data, ...prev.filter((h) => h.address !== data.address)].slice(0, 20));
      }
    } catch {
      setError("Failed to connect to scanner");
    } finally {
      setScanning(false);
    }
  }, [address, chain]);

  const handleSafeBuy = useCallback(async () => {
    if (!result || !walletAddress) return;
    setBuying(true);
    setBuyResult(null);

    try {
      const res = await fetch("/api/safe-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenAddress: result.address,
          chain,
          amount: buyAmount,
          wallet: walletAddress,
          threshold: 60,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setBuyResult({ success: false, message: data.error });
      } else if (data.allowed === false) {
        setBuyResult({ success: false, message: `Swap blocked: risk score ${data.riskReport?.overallScore ?? "?"}/100 exceeds threshold` });
      } else if (data.swapTxHash) {
        setBuyResult({ success: true, message: `Swap executed! TX: ${data.swapTxHash}` });
      } else {
        setBuyResult({ success: true, message: "Swap approved — check wallet for confirmation" });
      }
    } catch {
      setBuyResult({ success: false, message: "Failed to execute safe-buy" });
    } finally {
      setBuying(false);
    }
  }, [result, chain, buyAmount, walletAddress]);

  const loadFromHistory = useCallback((scan: ScanResult) => {
    setResult(scan);
    setAddress(scan.address);
    setBuyResult(null);
  }, []);

  const isSafe = result && result.overallScore < 60;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
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
          <div className="flex items-center gap-4">
            <Nav />
            {/* Wallet indicator */}
            <button
              onClick={() => setShowWalletConfig(!showWalletConfig)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                walletConnected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${walletConnected ? "bg-emerald-500" : "bg-gray-400"}`} />
              {walletConnected ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Connect Wallet"}
            </button>
          </div>
        </div>
        {/* Wallet config dropdown */}
        {showWalletConfig && (
          <div className="border-t border-[var(--border)] bg-[var(--muted)]">
            <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
              <label className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">Agentic Wallet:</label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => {
                  setWalletAddress(e.target.value);
                  setWalletConnected(/^0x[a-fA-F0-9]{40}$/.test(e.target.value));
                }}
                className="flex-1 max-w-md px-3 py-1.5 text-xs font-mono border border-[var(--border)] rounded-lg bg-white"
                placeholder="0x your agentic wallet address..."
              />
              <span className="text-[10px] text-[var(--muted-foreground)]">Gas-free on X Layer</span>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {/* Search */}
        <div className="mb-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight mb-1">Scan a Token</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-5">
              Enter a contract address to run a 10-dimensional risk analysis
            </p>
          </div>
          <div className="flex gap-3 max-w-2xl">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              placeholder="0x token contract address..."
              className="flex-1 px-4 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-white placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-shadow font-mono"
            />
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer"
            >
              <option value="xlayer">X Layer</option>
              <option value="ethereum">Ethereum</option>
              <option value="base">Base</option>
              <option value="bsc">BSC</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="solana">Solana</option>
            </select>
            <button
              onClick={handleScan}
              disabled={scanning || !address.trim()}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[var(--foreground)] rounded-lg hover:bg-[#1e293b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {scanning ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scanning...
                </span>
              ) : (
                "Scan"
              )}
            </button>
          </div>
          {error && (
            <div className="mt-3 px-4 py-2.5 text-sm text-[var(--danger)] bg-[var(--danger-light)] rounded-lg border border-red-100 max-w-2xl">
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-8">
            {/* Score Header */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <RiskGauge score={result.overallScore} level={result.level} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-semibold tracking-tight">{result.tokenSymbol}</h3>
                  <span className="text-sm text-[var(--muted-foreground)]">{result.tokenName}</span>
                  <LevelBadge level={result.level} />
                </div>
                <p className="text-sm text-[var(--muted-foreground)] font-mono mb-4 truncate">{result.address}</p>
                <p className="text-sm leading-relaxed text-[var(--foreground)]">{result.summary}</p>
                <div className="mt-4 px-4 py-3 bg-[var(--muted)] rounded-lg border border-[var(--border)]">
                  <p className="text-sm font-medium">{result.recommendation}</p>
                </div>

                {/* Safe Buy Action */}
                <div className="mt-4">
                  {isSafe && walletConnected ? (
                    <div className="flex items-center gap-3 p-4 bg-[var(--success-light)] rounded-xl border border-emerald-200">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-800">Safe to trade</p>
                        <p className="text-xs text-emerald-700 mt-0.5">Buy via Agentic Wallet — gas-free on X Layer</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-emerald-300 rounded-lg overflow-hidden bg-white">
                          <input
                            type="number"
                            value={buyAmount}
                            onChange={(e) => setBuyAmount(e.target.value)}
                            className="w-20 px-3 py-2 text-sm text-right focus:outline-none"
                            min="1"
                          />
                          <span className="px-2 text-xs text-emerald-700 bg-emerald-50 border-l border-emerald-300 py-2">USDC</span>
                        </div>
                        <button
                          onClick={handleSafeBuy}
                          disabled={buying}
                          className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {buying ? (
                            <span className="flex items-center gap-2">
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Buying...
                            </span>
                          ) : (
                            "Safe Buy"
                          )}
                        </button>
                      </div>
                    </div>
                  ) : result && !isSafe ? (
                    <div className="flex items-center gap-3 p-4 bg-[var(--danger-light)] rounded-xl border border-red-200">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-red-800">Trading blocked</p>
                        <p className="text-xs text-red-700">Risk score {result.overallScore}/100 exceeds safety threshold. Do not buy.</p>
                      </div>
                    </div>
                  ) : !walletConnected ? (
                    <button
                      onClick={() => setShowWalletConfig(true)}
                      className="w-full p-3 text-sm text-[var(--muted-foreground)] bg-[var(--muted)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                    >
                      Connect Agentic Wallet to enable safe trading
                    </button>
                  ) : null}

                  {/* Buy result */}
                  {buyResult && (
                    <div className={`mt-3 px-4 py-3 text-sm rounded-lg border ${
                      buyResult.success
                        ? "bg-[var(--success-light)] text-emerald-800 border-emerald-200"
                        : "bg-[var(--danger-light)] text-red-800 border-red-200"
                    }`}>
                      {buyResult.message}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Risk Factors Grid */}
            <div>
              <h3 className="text-lg font-semibold tracking-tight mb-4">Risk Factors</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {result.factors.map((factor) => (
                  <FactorCard key={factor.name} factor={factor} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!result && !scanning && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--muted)] mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="text-[var(--muted-foreground)] text-sm">
              Paste a token address above to analyze its safety
            </p>
          </div>
        )}

        {/* Scanning State */}
        {scanning && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--muted)] mb-4">
              <svg className="animate-spin h-7 w-7 text-[var(--accent)]" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-[var(--muted-foreground)] text-sm">
              Running 10-dimensional risk analysis...
            </p>
            <p className="text-[var(--muted-foreground)] text-xs mt-1">
              Checking honeypot, taxes, holders, developer, liquidity, manipulation, bundles, verification, clusters, Uniswap
            </p>
          </div>
        )}

        {/* Scan History */}
        {history.length > 0 && !scanning && (
          <div className="mt-12">
            <ScanHistory history={history} onSelect={loadFromHistory} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Token Watchdog &middot; Built for OKX Build X Hackathon</span>
          <span>X Layer &middot; OnchainOS &middot; Skills Arena</span>
        </div>
      </footer>
    </div>
  );
}

function LevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    SAFE: "bg-[var(--success-light)] text-[var(--success)] border-green-200",
    CAUTION: "bg-amber-50 text-amber-700 border-amber-200",
    WARNING: "bg-orange-50 text-orange-700 border-orange-200",
    DANGER: "bg-[var(--danger-light)] text-[var(--danger)] border-red-200",
    CRITICAL: "bg-red-100 text-[var(--critical)] border-red-300",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border ${styles[level] ?? styles.CAUTION}`}>
      {level}
    </span>
  );
}
