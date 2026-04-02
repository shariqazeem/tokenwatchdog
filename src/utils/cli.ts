import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ONCHAINOS_BIN = process.env.ONCHAINOS_BIN || "onchainos";

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute an onchainos CLI command and return parsed output.
 */
export async function run(args: string[], timeoutMs = 30_000): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(ONCHAINOS_BIN, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: (e.stdout ?? "").trim(),
      stderr: (e.stderr ?? "").trim(),
      exitCode: e.code ?? 1,
    };
  }
}

/**
 * Run an onchainos command and parse stdout as JSON.
 * Falls back to returning raw stdout if JSON parsing fails.
 */
export async function runJson<T = unknown>(args: string[], timeoutMs = 30_000): Promise<T> {
  const result = await run(args, timeoutMs);

  if (result.exitCode !== 0 && !result.stdout) {
    throw new Error(`onchainos ${args.join(" ")} failed (exit ${result.exitCode}): ${result.stderr}`);
  }

  const text = result.stdout;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some commands may wrap JSON in extra text — try to extract it
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    throw new Error(`Failed to parse JSON from onchainos output: ${text.slice(0, 200)}`);
  }
}

/**
 * Resolve chain name to chain index.
 */
export function resolveChain(chain: string): string {
  const map: Record<string, string> = {
    ethereum: "1", eth: "1",
    bsc: "56", bnb: "56",
    polygon: "137",
    arbitrum: "42161", arb: "42161",
    optimism: "10", op: "10",
    base: "8453",
    xlayer: "196", "x-layer": "196", "x layer": "196",
    solana: "501", sol: "501",
    tron: "195",
    sui: "784",
    ton: "607",
    avalanche: "43114", avax: "43114",
    sonic: "146",
  };
  return map[chain.toLowerCase()] ?? chain;
}
