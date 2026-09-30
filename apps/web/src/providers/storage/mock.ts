import { keccak256, toHex } from "viem";
import type { EventMetadata, StorageProvider } from "./types";

export interface MockStorageProviderOptions {
  /** Simulated latency in ms per call. Defaults to 0 (instant, for tests). */
  latencyMs?: number;
  /**
   * When true, every upload rejects, so consumers can exercise their error
   * handling before a real storage backend is connected. Defaults to false.
   */
  simulateError?: boolean;
}

const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * A deterministic 46-char base32-ish CID stand-in derived from a seed. Not a
 * real CID — it only needs to look plausible and be stable per input so the
 * mock feels like real IPFS pinning.
 */
function fakeCid(seed: string): string {
  const hash = keccak256(toHex(seed)).slice(2); // 64 hex chars
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let out = "";
  for (let i = 0; i < 44; i += 1) {
    const nibble = parseInt(hash[i % hash.length] ?? "0", 16);
    out += alphabet[nibble % alphabet.length];
  }
  return `bafy${out}`;
}

/**
 * Mock StorageProvider that returns fake `ipfs://<cid>` URIs without touching a
 * network. It can simulate latency and failures so consumer flows and error
 * handling are exercised before Pinata is wired in (Requirement R11.3).
 *
 * The returned URIs are deterministic per input so tests can assert on them.
 */
export class MockStorageProvider implements StorageProvider {
  private readonly latencyMs: number;
  private readonly simulateError: boolean;

  constructor(options: MockStorageProviderOptions = {}) {
    this.latencyMs = options.latencyMs ?? 0;
    this.simulateError = options.simulateError ?? false;
  }

  async uploadImage(file: Blob): Promise<string> {
    await delay(this.latencyMs);
    if (this.simulateError) {
      throw new Error("Mock storage: image upload failed.");
    }
    const seed = `image:${file.size}:${file.type}`;
    return `ipfs://${fakeCid(seed)}`;
  }

  async uploadMetadata(meta: EventMetadata): Promise<string> {
    await delay(this.latencyMs);
    if (this.simulateError) {
      throw new Error("Mock storage: metadata upload failed.");
    }
    const seed = `metadata:${JSON.stringify(meta)}`;
    return `ipfs://${fakeCid(seed)}`;
  }
}
