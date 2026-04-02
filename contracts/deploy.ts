/**
 * Deployment script for WatchdogGuard on X Layer.
 *
 * Uses raw JSON-RPC calls — no ethers / web3 / hardhat dependency.
 *
 * Usage:
 *   DEPLOYER_KEY=0x... WATCHDOG_SIGNER_ADDR=0x... npx tsx contracts/deploy.ts
 *
 * Environment variables:
 *   DEPLOYER_KEY           Private key of the deployer (hex, with or without 0x prefix)
 *   WATCHDOG_SIGNER_ADDR   Public address of the attestation signer
 *   XLAYER_RPC             (optional) RPC URL, defaults to https://rpc.xlayer.tech
 *   MAX_RISK_SCORE         (optional) Max risk score, defaults to 60
 */

import { createHash, sign, createPublicKey, createPrivateKey } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Config ───────────────────────────────────────────────────────────

const RPC_URL = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";
const CHAIN_ID = 196;
const AGENTIC_WALLET = "0x6db686fe9e983b3bcafb6c42f370fd40aff38b8e";

// ── Pre-compiled bytecode placeholder ────────────────────────────────
// In production you would compile with solc and paste the bytecode here.
// For now this script shows the full deployment flow; compile separately
// with `solc --bin --abi contracts/WatchdogGuard.sol` and replace.

const COMPILED_BYTECODE_PATH = path.join(__dirname, "WatchdogGuard.bin");

// ── JSON-RPC helper ──────────────────────────────────────────────────

let rpcId = 1;

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string; code: number } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

// ── Helpers ──────────────────────────────────────────────────────────

function bufToBigInt(buf: Buffer | Uint8Array): bigint {
  let hex = "";
  for (const b of buf) hex += b.toString(16).padStart(2, "0");
  return BigInt("0x" + hex);
}

function publicKeyFromPrivate(privKey: Buffer): Buffer {
  const privKeyObj = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("30740201010420", "hex"),
      privKey,
      Buffer.from("a00706052b8104000a", "hex"),
    ]),
    format: "der",
    type: "sec1",
  });
  const pubKeyObj = createPublicKey(privKeyObj);
  const spki = pubKeyObj.export({ format: "der", type: "spki" });
  return Buffer.from(spki).subarray(-65).subarray(1); // 64 bytes x+y
}

function addressFromPublicKey(pubKey: Buffer): string {
  // Ethereum address = last 20 bytes of keccak256(uncompressed pub key without 04 prefix)
  // We need keccak-256 here, same as attestation.ts
  // For deployment tooling we use a simplified inline version
  const hash = keccak256(pubKey);
  return "0x" + hash.subarray(12).toString("hex");
}

// Minimal keccak-256 (same implementation as attestation.ts)
function keccak256(data: Uint8Array): Buffer {
  return Buffer.from(keccakDigest(data, 256));
}

const ROUND_CONSTANTS: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808An,
  0x8000000080008000n, 0x000000000000808Bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008An,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000An,
  0x000000008000808Bn, 0x800000000000008Bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800An, 0x800000008000000An, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const ROTATION_OFFSETS: number[] = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14,
  27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
];

const PI_LANE: number[] = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4,
  15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
];

function keccakPermutation(state: bigint[]): void {
  const mask64 = (1n << 64n) - 1n;
  for (let round = 0; round < 24; round++) {
    const c: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      c[x] = state[x]! ^ state[x + 5]! ^ state[x + 10]! ^ state[x + 15]! ^ state[x + 20]!;
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5]! ^ (((c[(x + 1) % 5]! << 1n) | (c[(x + 1) % 5]! >> 63n)) & mask64);
      for (let y = 0; y < 25; y += 5) {
        state[y + x] = (state[y + x]! ^ d) & mask64;
      }
    }
    let last = state[1]!;
    for (let i = 0; i < 24; i++) {
      const j = PI_LANE[i]!;
      const tmp = state[j]!;
      const rot = BigInt(ROTATION_OFFSETS[i]!);
      state[j] = (((last << rot) | (last >> (64n - rot))) & mask64);
      last = tmp;
    }
    for (let y = 0; y < 25; y += 5) {
      const t: bigint[] = [];
      for (let x = 0; x < 5; x++) t[x] = state[y + x]!;
      for (let x = 0; x < 5; x++) {
        state[y + x] = (t[x]! ^ ((~t[(x + 1) % 5]!) & t[(x + 2) % 5]!)) & mask64;
      }
    }
    state[0] = (state[0]! ^ ROUND_CONSTANTS[round]!) & mask64;
  }
}

function keccakDigest(input: Uint8Array, bits: number): Uint8Array {
  const rate = 200 - (bits / 4);
  const blockSize = rate;
  const padLen = blockSize - (input.length % blockSize);
  const padded = new Uint8Array(input.length + padLen);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  const state: bigint[] = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += blockSize) {
    for (let i = 0; i < blockSize; i += 8) {
      const lane = i / 8;
      let v = 0n;
      for (let b = 0; b < 8; b++) {
        v |= BigInt(padded[offset + i + b]!) << BigInt(b * 8);
      }
      state[lane] = state[lane]! ^ v;
    }
    keccakPermutation(state);
  }
  const out = new Uint8Array(bits / 8);
  for (let i = 0; i < out.length; i += 8) {
    const lane = state[i / 8]!;
    for (let b = 0; b < 8 && i + b < out.length; b++) {
      out[i + b] = Number((lane >> BigInt(b * 8)) & 0xFFn);
    }
  }
  return out;
}

// ── Transaction signing (raw EIP-1559) ───────────────────────────────

function rlpEncode(input: Buffer | Buffer[]): Buffer {
  if (Array.isArray(input)) {
    const encoded = Buffer.concat(input.map(rlpEncode));
    if (encoded.length < 56) {
      return Buffer.concat([Buffer.from([0xc0 + encoded.length]), encoded]);
    }
    const lenBytes = encodeBigEndian(BigInt(encoded.length));
    return Buffer.concat([Buffer.from([0xf7 + lenBytes.length]), lenBytes, encoded]);
  }
  const buf = input as Buffer;
  if (buf.length === 1 && buf[0]! < 0x80) return buf;
  if (buf.length < 56) {
    return Buffer.concat([Buffer.from([0x80 + buf.length]), buf]);
  }
  const lenBytes = encodeBigEndian(BigInt(buf.length));
  return Buffer.concat([Buffer.from([0xb7 + lenBytes.length]), lenBytes, buf]);
}

function encodeBigEndian(n: bigint): Buffer {
  if (n === 0n) return Buffer.alloc(0);
  const hex = n.toString(16);
  return Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
}

function bigIntToRlpBuf(n: bigint): Buffer {
  if (n === 0n) return Buffer.alloc(0);
  const hex = n.toString(16);
  return Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
}

// ── Main deploy ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  const deployerKey = process.env.DEPLOYER_KEY;
  if (!deployerKey) {
    console.error("Error: DEPLOYER_KEY environment variable is required");
    process.exit(1);
  }

  const signerAddr = process.env.WATCHDOG_SIGNER_ADDR;
  if (!signerAddr) {
    console.error("Error: WATCHDOG_SIGNER_ADDR environment variable is required");
    process.exit(1);
  }

  const maxRisk = parseInt(process.env.MAX_RISK_SCORE || "60", 10);

  // Derive deployer address
  const privKeyBuf = Buffer.from(deployerKey.replace(/^0x/, ""), "hex");
  const pubKey = publicKeyFromPrivate(privKeyBuf);
  const deployerAddr = addressFromPublicKey(pubKey);
  console.log(`Deployer address: ${deployerAddr}`);
  console.log(`Signer address:   ${signerAddr}`);
  console.log(`Max risk score:   ${maxRisk}`);
  console.log(`RPC:              ${RPC_URL}`);
  console.log(`Chain ID:         ${CHAIN_ID}`);

  // Load bytecode
  let bytecode: string;
  if (fs.existsSync(COMPILED_BYTECODE_PATH)) {
    bytecode = fs.readFileSync(COMPILED_BYTECODE_PATH, "utf8").trim();
    if (!bytecode.startsWith("0x")) bytecode = "0x" + bytecode;
  } else {
    console.error(
      `\nCompiled bytecode not found at ${COMPILED_BYTECODE_PATH}`,
    );
    console.error(
      "Compile the contract first:\n" +
      "  solc --bin --optimize --optimize-runs 200 contracts/WatchdogGuard.sol -o contracts/\n" +
      "Then rename the output to WatchdogGuard.bin\n",
    );
    process.exit(1);
  }

  // ABI-encode constructor args: (address _signer, uint256 _maxRiskScore)
  const constructorArgs =
    signerAddr.toLowerCase().replace(/^0x/, "").padStart(64, "0") +
    BigInt(maxRisk).toString(16).padStart(64, "0");

  const deployData = bytecode + constructorArgs;

  // Get nonce
  const nonceHex = (await rpc("eth_getTransactionCount", [deployerAddr, "latest"])) as string;
  const nonce = BigInt(nonceHex);
  console.log(`\nNonce: ${nonce}`);

  // Estimate gas
  const estimatePayload = { from: deployerAddr, data: deployData };
  const gasEstHex = (await rpc("eth_estimateGas", [estimatePayload])) as string;
  const gasLimit = (BigInt(gasEstHex) * 130n) / 100n; // +30% buffer
  console.log(`Gas estimate: ${BigInt(gasEstHex)} (limit: ${gasLimit})`);

  // Gas price
  const gasPriceHex = (await rpc("eth_gasPrice")) as string;
  const gasPrice = BigInt(gasPriceHex);
  console.log(`Gas price: ${gasPrice} wei`);

  // Build legacy transaction (X Layer supports legacy txns)
  const txFields: Buffer[] = [
    bigIntToRlpBuf(nonce),           // nonce
    bigIntToRlpBuf(gasPrice),        // gasPrice
    bigIntToRlpBuf(gasLimit),        // gasLimit
    Buffer.alloc(0),                 // to (empty = contract creation)
    bigIntToRlpBuf(0n),             // value
    Buffer.from(deployData.replace(/^0x/, ""), "hex"), // data
  ];

  // EIP-155 signing (chainId in v)
  const chainIdBuf = bigIntToRlpBuf(BigInt(CHAIN_ID));
  const toSign = rlpEncode([...txFields, chainIdBuf, Buffer.alloc(0), Buffer.alloc(0)]);
  const txHash = keccak256(Buffer.concat([toSign]));

  // Sign
  const derSig = sign(null, txHash, {
    key: Buffer.concat([
      Buffer.from("30740201010420", "hex"),
      privKeyBuf,
      Buffer.from("a00706052b8104000aa14403420004", "hex"),
      pubKey,
    ]),
    format: "der",
    type: "sec1",
    dsaEncoding: "ieee-p1363",
  });

  const r = derSig.subarray(0, 32);
  const s = derSig.subarray(32, 64);

  // Normalise s
  const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const HALF_N = SECP256K1_N / 2n;
  let sBig = bufToBigInt(s);
  let sFlipped = false;
  if (sBig > HALF_N) {
    sBig = SECP256K1_N - sBig;
    sFlipped = true;
  }
  const sNorm = Buffer.from(sBig.toString(16).padStart(64, "0"), "hex");

  // EIP-155 v = chainId * 2 + 35 or 36
  const vBase = BigInt(CHAIN_ID) * 2n + 35n;
  const v = sFlipped ? vBase + 1n : vBase;

  // Build signed transaction
  const signedTxFields: Buffer[] = [
    ...txFields,
    bigIntToRlpBuf(v),
    r,
    sNorm,
  ];
  const rawTx = "0x" + rlpEncode(signedTxFields).toString("hex");

  console.log(`\nSending transaction...`);
  const txHashResult = (await rpc("eth_sendRawTransaction", [rawTx])) as string;
  console.log(`TX hash: ${txHashResult}`);

  // Wait for receipt
  console.log("Waiting for confirmation...");
  let receipt: { contractAddress?: string; status?: string } | null = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    receipt = (await rpc("eth_getTransactionReceipt", [txHashResult])) as typeof receipt;
    if (receipt) break;
  }

  if (!receipt) {
    console.error("Transaction not confirmed after 3 minutes.");
    process.exit(1);
  }

  if (receipt.status !== "0x1") {
    console.error("Transaction reverted!");
    process.exit(1);
  }

  const contractAddress = receipt.contractAddress!;
  console.log(`\nContract deployed at: ${contractAddress}`);
  console.log(`Agentic Wallet:      ${AGENTIC_WALLET}`);

  // Save deployment info
  const deployment = {
    contract: "WatchdogGuard",
    address: contractAddress,
    deployer: deployerAddr,
    signer: signerAddr,
    maxRiskScore: maxRisk,
    chainId: CHAIN_ID,
    rpc: RPC_URL,
    txHash: txHashResult,
    agenticWallet: AGENTIC_WALLET,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`Deployment info saved to ${outPath}`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
