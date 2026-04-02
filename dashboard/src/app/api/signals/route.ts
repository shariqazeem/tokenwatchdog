import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const ONCHAINOS = path.join(os.homedir(), ".local/bin/onchainos");

export async function GET(req: NextRequest) {
  const chain = req.nextUrl.searchParams.get("chain") || "xlayer";
  const type = req.nextUrl.searchParams.get("type") || "smart_money";

  try {
    const { stdout } = await execFileAsync(
      ONCHAINOS,
      ["tracker", "activities", "--tracker-type", type, "--chain", chain, "--trade-type", "0"],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } }
    );

    const raw = JSON.parse(stdout.trim());
    // Response: { ok, data: { trades: [...] } }
    const trades = raw?.data?.trades ?? raw?.data ?? [];

    return NextResponse.json({ trades: (Array.isArray(trades) ? trades : []).slice(0, 30) });
  } catch (err: unknown) {
    const e = err as { message?: string; stdout?: string };
    if (e.stdout) {
      try {
        const raw = JSON.parse(e.stdout.trim());
        const trades = raw?.data?.trades ?? raw?.data ?? [];
        return NextResponse.json({ trades: (Array.isArray(trades) ? trades : []).slice(0, 30) });
      } catch {}
    }
    return NextResponse.json({ error: "Failed to fetch signals", details: e.message }, { status: 500 });
  }
}
