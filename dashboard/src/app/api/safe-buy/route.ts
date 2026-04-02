import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tokenAddress, chain, amount, wallet, threshold } = body;

  if (!tokenAddress || !wallet) {
    return NextResponse.json({ error: "Missing tokenAddress or wallet" }, { status: 400 });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
    return NextResponse.json({ error: "Invalid token address" }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const scanScript = path.join(PROJECT_ROOT, "src", "index.ts");
    const args = [
      "tsx", scanScript, "safe-buy", tokenAddress,
      "--chain", chain || "xlayer",
      "--amount", String(amount || "100"),
      "--wallet", wallet,
      "--threshold", String(threshold || "60"),
      "--json",
    ];

    const { stdout } = await execFileAsync("npx", args, {
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
      cwd: PROJECT_ROOT,
      env: { ...process.env, NO_COLOR: "1" },
    });

    const result = JSON.parse(stdout.trim());
    return NextResponse.json(result);
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    if (e.stdout) {
      try {
        const result = JSON.parse(e.stdout.trim());
        return NextResponse.json(result);
      } catch {}
    }
    return NextResponse.json(
      { error: "Safe-buy failed", details: e.stderr || e.message },
      { status: 500 }
    );
  }
}
