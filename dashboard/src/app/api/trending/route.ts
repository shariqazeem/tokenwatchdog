import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const ONCHAINOS = path.join(os.homedir(), ".local/bin/onchainos");

export async function GET(req: NextRequest) {
  const chain = req.nextUrl.searchParams.get("chain") || "xlayer";
  const rankBy = req.nextUrl.searchParams.get("rankBy") || "5"; // 5=volume
  const timeFrame = req.nextUrl.searchParams.get("timeFrame") || "4"; // 4=24h

  try {
    const { stdout } = await execFileAsync(
      ONCHAINOS,
      ["token", "hot-tokens", "--chain", chain, "--rank-by", rankBy, "--time-frame", timeFrame],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } }
    );

    const raw = JSON.parse(stdout.trim());
    const tokens = (raw?.data ?? []).slice(0, 20);

    // Return all tokens immediately — risk scores loaded progressively by frontend
    return NextResponse.json({
      tokens: tokens.map((t: any) => ({
        ...t,
        riskScore: null,
        riskLevel: "UNKNOWN",
        riskSummary: "",
      })),
    });
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string };
    if (e.stdout) {
      try {
        const raw = JSON.parse(e.stdout.trim());
        const tokens = (raw?.data ?? []).slice(0, 20);
        return NextResponse.json({
          tokens: tokens.map((t: any) => ({ ...t, riskScore: null, riskLevel: "UNKNOWN", riskSummary: "" })),
        });
      } catch {}
    }
    return NextResponse.json({ error: "Failed to fetch trending", details: e.message }, { status: 500 });
  }
}
