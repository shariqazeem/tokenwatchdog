"use client";

interface ScanResult {
  tokenSymbol: string;
  tokenName: string;
  chain: string;
  address: string;
  overallScore: number;
  level: string;
  summary: string;
  recommendation: string;
  factors: { name: string; score: number; weight: number; detail: string }[];
  timestamp: string;
}

export function ScanHistory({
  history,
  onSelect,
}: {
  history: ScanResult[];
  onSelect: (scan: ScanResult) => void;
}) {
  const levelDot: Record<string, string> = {
    SAFE: "bg-emerald-500",
    CAUTION: "bg-amber-500",
    WARNING: "bg-orange-500",
    DANGER: "bg-red-500",
    CRITICAL: "bg-red-700",
  };

  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight mb-4">Recent Scans</h3>
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Token</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Chain</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Score</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Level</th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Time</th>
            </tr>
          </thead>
          <tbody>
            {history.map((scan, i) => (
              <tr
                key={`${scan.address}-${i}`}
                onClick={() => onSelect(scan)}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)] cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="font-medium">{scan.tokenSymbol}</span>
                  <span className="text-[var(--muted-foreground)] ml-1.5">{scan.tokenName}</span>
                </td>
                <td className="px-4 py-3 text-[var(--muted-foreground)]">{scan.chain}</td>
                <td className="px-4 py-3 font-mono font-semibold tabular-nums">{scan.overallScore}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${levelDot[scan.level] ?? "bg-gray-400"}`} />
                    <span className="text-xs font-medium">{scan.level}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted-foreground)] text-xs">
                  {new Date(scan.timestamp).toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
