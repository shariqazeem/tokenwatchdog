import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

// Resolve project root (parent of dashboard/)
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const chain = req.nextUrl.searchParams.get("chain") || "xlayer";

  if (!address) {
    return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid EVM address format" }, { status: 400 });
  }

  try {
    const scanScript = path.join(PROJECT_ROOT, "src", "index.ts");
    const { stdout } = await execFileAsync(
      "npx",
      ["tsx", scanScript, "scan", address, "--chain", chain, "--json"],
      {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: PROJECT_ROOT,
        env: { ...process.env, NO_COLOR: "1" },
      }
    );

    const report = JSON.parse(stdout.trim());
    return NextResponse.json(report);
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };

    // Try to parse stdout even on non-zero exit (score >= 60 exits with code 1)
    if (e.stdout) {
      try {
        const report = JSON.parse(e.stdout.trim());
        return NextResponse.json(report);
      } catch {}
    }

    return NextResponse.json(
      { error: "Scan failed", details: e.stderr || e.message || "Unknown error" },
      { status: 500 }
    );
  }
}
