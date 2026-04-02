import { runJson } from "../utils/cli.js";

const XLAYER_RPC = "https://rpc.xlayer.tech";

export interface SwapCalldata {
  to: string;
  data: string;
  value: string;
  gas?: string;
}

export interface SimulationResult {
  success: boolean;
  revertReason?: string;
  gasEstimate?: string;
}

/**
 * Fetch swap calldata from onchainos without executing the trade.
 * `onchainos swap swap` returns the raw transaction fields.
 */
export async function getSwapCalldata(
  fromToken: string,
  toToken: string,
  amount: string,
  chain: string,
  wallet: string,
  slippage?: string,
): Promise<SwapCalldata> {
  const args = [
    "swap", "swap",
    "--from", fromToken,
    "--to", toToken,
    "--readable-amount", amount,
    "--chain", chain,
    "--wallet", wallet,
  ];

  if (slippage) {
    args.push("--slippage", slippage);
  }

  const result = await runJson<any>(args, 60_000);

  // Response: { ok, data: [{ tx: { to, data, value, gas, from }, routerResult: {...} }] }
  const dataArr = Array.isArray(result?.data) ? result.data : [result?.data ?? result];
  const entry = dataArr[0] ?? {};
  const tx = entry?.tx ?? entry;

  if (!tx.to || !tx.data) {
    throw new Error("Swap calldata missing 'to' or 'data' fields");
  }

  // Ensure value is hex-formatted for eth_call
  let value = tx.value ?? "0x0";
  if (typeof value === "number" || (typeof value === "string" && !value.startsWith("0x"))) {
    const num = BigInt(value || 0);
    value = "0x" + num.toString(16);
  }

  return {
    to: tx.to,
    data: tx.data,
    value,
    gas: tx.gas ? String(tx.gas) : undefined,
  };
}

/**
 * Simulate a transaction via eth_call against the X Layer RPC.
 * Returns whether the call would succeed plus any revert reason.
 */
export async function simulateTransaction(
  calldata: SwapCalldata,
  fromAddress: string,
): Promise<SimulationResult> {
  const payload = {
    jsonrpc: "2.0" as const,
    id: 1,
    method: "eth_call",
    params: [
      {
        from: fromAddress,
        to: calldata.to,
        data: calldata.data,
        value: calldata.value,
      },
      "latest",
    ],
  };

  let response: Response;
  try {
    response = await fetch(XLAYER_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      success: false,
      revertReason: `RPC request failed: ${err}`,
    };
  }

  if (!response.ok) {
    return {
      success: false,
      revertReason: `RPC HTTP error ${response.status}: ${response.statusText}`,
    };
  }

  const json = (await response.json()) as {
    result?: string;
    error?: { code?: number; message?: string; data?: string };
  };

  if (json.error) {
    const rawReason = decodeRevertReason(json.error.data) ?? json.error.message ?? "unknown error";
    // Make common revert reasons human-readable
    const reason = humanizeRevertReason(rawReason);
    return { success: false, revertReason: reason };
  }

  // Estimate gas via a second RPC call
  const gasEstimate = await estimateGas(calldata, fromAddress);

  return { success: true, gasEstimate };
}

/**
 * Try to decode a Solidity revert reason from the returned error data.
 * Revert strings are ABI-encoded as Error(string): 0x08c379a0 + offset + length + utf8.
 */
function decodeRevertReason(data?: string): string | undefined {
  if (!data || typeof data !== "string") return undefined;

  // Standard Error(string) selector
  const ERROR_SELECTOR = "0x08c379a0";

  if (data.startsWith(ERROR_SELECTOR) && data.length >= 138) {
    try {
      const offsetHex = data.slice(10, 74);
      const offset = parseInt(offsetHex, 16);
      // length sits at 4 (selector) + offset bytes, each byte = 2 hex chars
      const lengthStart = 10 + offset * 2;
      const lengthHex = data.slice(lengthStart, lengthStart + 64);
      const length = parseInt(lengthHex, 16);
      const strHex = data.slice(lengthStart + 64, lengthStart + 64 + length * 2);
      const bytes = Buffer.from(strHex, "hex");
      return bytes.toString("utf8");
    } catch {
      return data;
    }
  }

  return data;
}

/**
 * Map common revert selectors and messages to human-readable explanations.
 */
function humanizeRevertReason(reason: string): string {
  // Known custom error selectors from DEX routers
  const KNOWN_SELECTORS: Record<string, string> = {
    "0xf4059071": "Insufficient token balance — wallet needs funding before swapping",
    "0xfb8f41b2": "Insufficient allowance — token approval needed",
    "0xe450d38c": "ERC20 insufficient balance",
    "0x13be252b": "Swap deadline expired",
  };

  const selector = reason.slice(0, 10).toLowerCase();
  if (KNOWN_SELECTORS[selector]) return KNOWN_SELECTORS[selector];

  // If it's just a hex string, label it
  if (/^0x[0-9a-f]+$/i.test(reason) && reason.length <= 10) {
    return `Transaction would revert (error ${reason}) — likely insufficient balance`;
  }

  return reason;
}

/**
 * Estimate gas for the transaction via eth_estimateGas.
 */
async function estimateGas(
  calldata: SwapCalldata,
  fromAddress: string,
): Promise<string | undefined> {
  const payload = {
    jsonrpc: "2.0" as const,
    id: 2,
    method: "eth_estimateGas",
    params: [
      {
        from: fromAddress,
        to: calldata.to,
        data: calldata.data,
        value: calldata.value,
      },
      "latest",
    ],
  };

  try {
    const response = await fetch(XLAYER_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return undefined;

    const json = (await response.json()) as { result?: string; error?: unknown };
    if (json.result) return json.result;
  } catch {
    // Gas estimation is best-effort; don't fail the simulation
  }

  return undefined;
}
