import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const ONCHAINOS = path.join(os.homedir(), ".local/bin/onchainos");
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

export async function GET(req: NextRequest) {
  const chain = req.nextUrl.searchParams.get("chain") || "xlayer";
  const rankBy = req.nextUrl.searchParams.get("rankBy") || "5"; // 5=volume
  const timeFrame = req.nextUrl.searchParams.get("timeFrame") || "4"; // 4=24h

  try {
    // Get hot tokens
    const { stdout } = await execFileAsync(
      ONCHAINOS,
      ["token", "hot-tokens", "--chain", chain, "--rank-by", rankBy, "--time-frame", timeFrame],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } }
    );

    const raw = JSON.parse(stdout.trim());
    const tokens = raw?.data ?? [];

    // Run quick scans on top 8 tokens in parallel
    const scanned = await Promise.all(
      tokens.slice(0, 8).map(async (t: any) => {
        try {
          const { stdout: scanOut } = await execFileAsync(
            "npx",
            ["tsx", path.join(PROJECT_ROOT, "src/index.ts"), "scan", t.tokenContractAddress, "--chain", chain, "--json"],
            { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, cwd: PROJECT_ROOT, env: { ...process.env, NO_COLOR: "1" } }
          );
          const report = JSON.parse(scanOut.trim());
          return { ...t, riskScore: report.overallScore, riskLevel: report.level, riskSummary: report.summary };
        } catch (err: unknown) {
          const e = err as { stdout?: string };
          if (e.stdout) {
            try {
              const report = JSON.parse(e.stdout.trim());
              return { ...t, riskScore: report.overallScore, riskLevel: report.level, riskSummary: report.summary };
            } catch {}
          }
          return { ...t, riskScore: null, riskLevel: "UNKNOWN", riskSummary: "Scan pending" };
        }
      })
    );

    return NextResponse.json({ tokens: scanned });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: "Failed to fetch trending", details: e.message }, { status: 500 });
  }
}
