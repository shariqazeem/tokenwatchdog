import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const chain = req.nextUrl.searchParams.get("chain") || "xlayer";

  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const { stdout } = await execFileAsync(
      "npx",
      ["tsx", path.join(PROJECT_ROOT, "src/index.ts"), "portfolio", wallet, "--chain", chain, "--json"],
      { timeout: 180_000, maxBuffer: 10 * 1024 * 1024, cwd: PROJECT_ROOT, env: { ...process.env, NO_COLOR: "1" } }
    );
    return NextResponse.json(JSON.parse(stdout.trim()));
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string };
    if (e.stdout) {
      try { return NextResponse.json(JSON.parse(e.stdout.trim())); } catch {}
    }
    return NextResponse.json({ error: "Portfolio scan failed", details: e.message }, { status: 500 });
  }
}
