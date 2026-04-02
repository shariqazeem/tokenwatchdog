"use client";

interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export function FactorCard({ factor }: { factor: RiskFactor }) {
  const weighted = Math.round(factor.score * factor.weight);
  const pct = factor.weight * 100;

  let barColor = "bg-emerald-500";
  let dotColor = "bg-emerald-500";
  let bgTint = "";

  if (factor.score >= 70) {
    barColor = "bg-red-500";
    dotColor = "bg-red-500";
    bgTint = "bg-red-50/50";
  } else if (factor.score >= 40) {
    barColor = "bg-amber-500";
    dotColor = "bg-amber-500";
    bgTint = "bg-amber-50/50";
  }

  return (
    <div className={`rounded-xl border border-[var(--border)] p-4 ${bgTint} transition-colors hover:border-[var(--muted-foreground)]/30`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-sm font-medium">{factor.name}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold tabular-nums">{factor.score}</span>
          <span className="text-xs text-[var(--muted-foreground)]">/100</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-[var(--border)] rounded-full mb-3 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${factor.score}%` }}
        />
      </div>

      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{factor.detail}</p>

      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
        <span>Weight: {pct.toFixed(0)}%</span>
        <span>Contribution: +{weighted}</span>
      </div>
    </div>
  );
}
