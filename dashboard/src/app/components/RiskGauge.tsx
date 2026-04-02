"use client";

export function RiskGauge({ score, level }: { score: number; level: string }) {
  const angle = (score / 100) * 180 - 90; // -90 to 90 degrees
  const circumference = Math.PI * 80; // half circle with r=80
  const filled = (score / 100) * circumference;

  const colors: Record<string, { stroke: string; bg: string; text: string }> = {
    SAFE: { stroke: "#16a34a", bg: "#f0fdf4", text: "#16a34a" },
    CAUTION: { stroke: "#f59e0b", bg: "#fffbeb", text: "#d97706" },
    WARNING: { stroke: "#f97316", bg: "#fff7ed", text: "#ea580c" },
    DANGER: { stroke: "#dc2626", bg: "#fef2f2", text: "#dc2626" },
    CRITICAL: { stroke: "#991b1b", bg: "#fef2f2", text: "#991b1b" },
  };

  const c = colors[level] ?? colors.CAUTION;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-44 h-24 overflow-hidden">
        <svg viewBox="0 0 200 110" className="w-full h-full">
          {/* Track */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={c.stroke}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            className="transition-all duration-700 ease-out"
          />
          {/* Needle */}
          <line
            x1="100"
            y1="100"
            x2={100 + 55 * Math.cos((angle * Math.PI) / 180)}
            y2={100 + 55 * Math.sin((angle * Math.PI) / 180)}
            stroke={c.stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
          <circle cx="100" cy="100" r="4" fill={c.stroke} />
        </svg>
      </div>
      <div className="text-center -mt-2">
        <span className="text-3xl font-bold tracking-tight" style={{ color: c.text }}>
          {score}
        </span>
        <span className="text-sm text-[var(--muted-foreground)]">/100</span>
      </div>
      <span className="text-xs text-[var(--muted-foreground)] mt-0.5">Risk Score</span>
    </div>
  );
}
