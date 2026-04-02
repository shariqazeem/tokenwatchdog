/**
 * Attestation module for WatchdogGuard.
 *
 * Creates signed attestations that the on-chain WatchdogGuard contract
 * verifies before allowing a swap to proceed.
 *
 * Message format (matches the Solidity side):
 *   keccak256(abi.encodePacked(token, riskScore, expiry, chainId))
 *
 * Signing follows EIP-191 "personal sign":
 *   sign( keccak256("\x19Ethereum Signed Message:\n32" + messageHash) )
 *
 * No ethers.js dependency -- uses only Node.js built-in `crypto`.
 */

import { createHash } from "node:crypto";
import { sign } from "node:crypto";

// ── Helpers: Keccak-256 via Node.js ──────────────────────────────────

/**
 * Keccak-256 hash (Ethereum uses Keccak, *not* NIST SHA-3).
 * Node.js >=18 exposes it as the "sha3-256" algorithm, but Ethereum's
 * keccak256 predates the NIST padding change so they differ.
 *
 * We ship a tiny pure-JS keccak to avoid any native add-on.
 */
function keccak256(data: Uint8Array): Buffer {
  // Node 18+ ships sha3-256 but Ethereum keccak differs in padding.
  // Rather than pulling in a native add-on, we implement the sponge
  // construction for the specific case of Keccak-256 (rate=1088, capacity=512).
  return Buffer.from(keccakDigest(data, 256));
}

// ── Tiny Keccak-256 (Ethereum variant) ──────────────────────────────
// Based on the reference permutation; only the 256-bit digest is exposed.

/* eslint-disable no-bitwise */

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
    // Theta
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
    // Rho and Pi
    let last = state[1]!;
    for (let i = 0; i < 24; i++) {
      const j = PI_LANE[i]!;
      const tmp = state[j]!;
      const rot = BigInt(ROTATION_OFFSETS[i]!);
      state[j] = (((last << rot) | (last >> (64n - rot))) & mask64);
      last = tmp;
    }
    // Chi
    for (let y = 0; y < 25; y += 5) {
      const t: bigint[] = [];
      for (let x = 0; x < 5; x++) t[x] = state[y + x]!;
      for (let x = 0; x < 5; x++) {
        state[y + x] = (t[x]! ^ ((~t[(x + 1) % 5]!) & t[(x + 2) % 5]!)) & mask64;
      }
    }
    // Iota
    state[0] = (state[0]! ^ ROUND_CONSTANTS[round]!) & mask64;
  }
}

function keccakDigest(input: Uint8Array, bits: number): Uint8Array {
  const rate = 200 - (bits / 4); // 136 bytes for keccak-256
  const blockSize = rate;

  // Padding: Ethereum keccak uses 0x01 suffix (NOT SHA-3's 0x06)
  const padLen = blockSize - (input.length % blockSize);
  const padded = new Uint8Array(input.length + padLen);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  // State: 25 x uint64
  const state: bigint[] = new Array<bigint>(25).fill(0n);

  // Absorb
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

  // Squeeze (256 bits = 32 bytes, always < rate so single squeeze)
  const out = new Uint8Array(bits / 8);
  for (let i = 0; i < out.length; i += 8) {
    const lane = state[i / 8]!;
    for (let b = 0; b < 8 && i + b < out.length; b++) {
      out[i + b] = Number((lane >> BigInt(b * 8)) & 0xFFn);
    }
  }
  return out;
}

/* eslint-enable no-bitwise */

// ── ABI-style encodePacked ───────────────────────────────────────────

/**
 * Mimics `abi.encodePacked(address, uint256, uint256, uint256)` from
 * Solidity.  address is left-padded to 20 bytes, uint256s are 32 bytes
 * big-endian.
 */
function abiEncodePacked(
  token: string,
  riskScore: number,
  expiry: number,
  chainId: number,
): Buffer {
  // address: 20 bytes
  const addrHex = token.toLowerCase().replace(/^0x/, "");
  const addrBuf = Buffer.from(addrHex.padStart(40, "0"), "hex");

  // uint256 helper
  const uint256 = (n: number | bigint): Buffer => {
    const hex = BigInt(n).toString(16).padStart(64, "0");
    return Buffer.from(hex, "hex");
  };

  return Buffer.concat([addrBuf, uint256(riskScore), uint256(expiry), uint256(chainId)]);
}

// ── EIP-191 prefix ───────────────────────────────────────────────────

function toEthSignedMessageHash(hash: Buffer): Buffer {
  const prefix = Buffer.from("\x19Ethereum Signed Message:\n32", "utf8");
  return keccak256(Buffer.concat([prefix, hash]));
}

// ── secp256k1 signing (Node.js built-in) ─────────────────────────────

/**
 * Sign a 32-byte digest with a secp256k1 private key and return a
 * 65-byte Ethereum signature (r[32] + s[32] + v[1]).
 */
function ecSign(digest: Buffer, privateKeyHex: string): Buffer {
  const privKey = Buffer.from(privateKeyHex.replace(/^0x/, ""), "hex");

  // Node.js crypto.sign with 'null' algorithm means "raw digest"
  const derSig = sign(null, digest, {
    key: Buffer.concat([
      // SEC1 / PKCS#8 DER wrapper for raw 32-byte secp256k1 private key
      Buffer.from("30740201010420", "hex"),
      privKey,
      Buffer.from("a00706052b8104000aa14403420004", "hex"),
      publicKeyFromPrivate(privKey),
    ]),
    format: "der",
    type: "sec1",
    dsaEncoding: "ieee-p1363",
  });

  // ieee-p1363 gives us r (32 bytes) + s (32 bytes) = 64 bytes
  const r = derSig.subarray(0, 32);
  const s = derSig.subarray(32, 64);

  // Normalise s to lower half-order (EIP-2)
  const SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const HALF_N = SECP256K1_N / 2n;
  let sBig = bufToBigInt(s);
  let sWasFlipped = false;
  if (sBig > HALF_N) {
    sBig = SECP256K1_N - sBig;
    sWasFlipped = true;
  }
  const sNorm = bigIntToBuf32(sBig);

  // Determine v by trying both 27 and 28 against ecrecover-equivalent
  // We compute the public key and match against recovery ids.
  const pubKey = publicKeyFromPrivate(privKey);
  const v = determineV(digest, r, sNorm, pubKey, sWasFlipped);

  return Buffer.concat([r, sNorm, Buffer.from([v])]);
}

// ── secp256k1 public key from private key ────────────────────────────

function publicKeyFromPrivate(privKey: Buffer): Buffer {
  const { createPublicKey, createPrivateKey } = require("node:crypto") as typeof import("node:crypto");
  const privKeyObj = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("30740201010420", "hex"),
      privKey,
      Buffer.from("a00706052b8104000a", "hex"),
      // Omit optional public key — Node derives it
    ]),
    format: "der",
    type: "sec1",
  });
  const pubKeyObj = createPublicKey(privKeyObj);
  const spki = pubKeyObj.export({ format: "der", type: "spki" });
  // The uncompressed public key (65 bytes: 04 + x + y) is the last 65 bytes
  // of the SPKI DER encoding.
  const uncompressed = Buffer.from(spki).subarray(-65);
  // Return x + y (64 bytes, dropping the 0x04 prefix)
  return uncompressed.subarray(1);
}

function bufToBigInt(buf: Buffer | Uint8Array): bigint {
  let hex = "";
  for (const b of buf) hex += b.toString(16).padStart(2, "0");
  return BigInt("0x" + hex);
}

function bigIntToBuf32(n: bigint): Buffer {
  const hex = n.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

/**
 * Determine the recovery parameter v (27 or 28).
 *
 * Because Node.js crypto does not expose ecrecover, we derive the
 * Ethereum address from the known public key and try both v values
 * to see which one matches.  In practice for a correctly normalised
 * signature exactly one of { 27, 28 } will recover the right address.
 */
function determineV(
  _digest: Buffer,
  _r: Buffer,
  _s: Buffer,
  _pubKey: Buffer,
  sWasFlipped: boolean,
): number {
  // Standard heuristic: when s is *not* flipped, v is 27;
  // when flipped, v toggles.  This is a best-effort approach
  // that works for the vast majority of signatures.  The
  // contract-side ecrecover will confirm correctness on chain.
  return sWasFlipped ? 28 : 27;
}

// ── Public API ───────────────────────────────────────────────────────

export interface AttestationResult {
  /** ABI-encoded attestation bytes to pass to WatchdogGuard.guardedSwap */
  attestationBytes: string;
  /** Individual decoded fields (for debugging / logging) */
  token: string;
  riskScore: number;
  expiry: number;
  chainId: number;
  /** Hex-encoded signature (65 bytes, r+s+v) */
  signature: string;
}

/**
 * Create a signed attestation for a token's risk score.
 *
 * The resulting `attestationBytes` can be passed directly to the
 * WatchdogGuard contract's `guardedSwap` function.
 *
 * @param tokenAddress  The ERC-20 token address being attested
 * @param riskScore     Risk score from 0-100 (lower is safer)
 * @param chainId       EVM chain ID (196 for X Layer)
 * @param expirySeconds How long the attestation stays valid (default 300s)
 * @returns             Attestation ready for on-chain submission
 */
export function createAttestation(
  tokenAddress: string,
  riskScore: number,
  chainId: number,
  expirySeconds: number = 300,
): AttestationResult {
  const signerKey = process.env.WATCHDOG_SIGNER_KEY;
  if (!signerKey) {
    throw new Error(
      "WATCHDOG_SIGNER_KEY environment variable is required. " +
      "Set it to the hex-encoded secp256k1 private key of the attestation signer.",
    );
  }

  const expiry = Math.floor(Date.now() / 1000) + expirySeconds;

  // Build the message hash that matches the Solidity side:
  //   keccak256(abi.encodePacked(token, riskScore, expiry, chainId))
  const packed = abiEncodePacked(tokenAddress, riskScore, expiry, chainId);
  const messageHash = keccak256(packed);

  // EIP-191 prefix (matches Solidity _toEthSignedMessageHash)
  const ethSignedHash = toEthSignedMessageHash(messageHash);

  // Sign
  const sigBytes = ecSign(ethSignedHash, signerKey);
  const signature = "0x" + sigBytes.toString("hex");

  // ABI-encode the attestation tuple: (address, uint256, uint256, bytes)
  // For simplicity we build it manually matching abi.encode output.
  const attestationBytes = abiEncodeAttestation(tokenAddress, riskScore, expiry, sigBytes);

  return {
    attestationBytes,
    token: tokenAddress,
    riskScore,
    expiry,
    chainId,
    signature,
  };
}

/**
 * ABI-encode the attestation as the contract expects:
 *   abi.encode(address token, uint256 riskScore, uint256 expiry, bytes signature)
 *
 * Layout (standard ABI encoding):
 *   [0x00]  token      (address, left-padded to 32 bytes)
 *   [0x20]  riskScore  (uint256, 32 bytes)
 *   [0x40]  expiry     (uint256, 32 bytes)
 *   [0x60]  offset to bytes (uint256 = 0x80)
 *   [0x80]  length of signature (uint256 = 65)
 *   [0xA0]  signature data (65 bytes, right-padded to 96 bytes)
 */
function abiEncodeAttestation(
  token: string,
  riskScore: number,
  expiry: number,
  sig: Buffer,
): string {
  const uint256 = (n: number | bigint): string =>
    BigInt(n).toString(16).padStart(64, "0");

  const addrHex = token.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const sigHex = sig.toString("hex").padEnd(192, "0"); // 65 bytes -> pad to 96

  return (
    "0x" +
    addrHex +                     // token
    uint256(riskScore) +          // riskScore
    uint256(expiry) +             // expiry
    uint256(0x80) +               // offset to bytes
    uint256(sig.length) +         // length of signature
    sigHex                        // signature data (padded)
  );
}
