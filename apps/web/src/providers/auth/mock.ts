import { type PrivateKeyAccount, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AuthProvider, TxRequest } from "./types";

/**
 * Well-known Anvil test account #0 private key. Dev-only default; the real
 * value can be overridden via `NEXT_PUBLIC_MOCK_PRIVATE_KEY`. NEVER use in
 * production — the Privy implementation replaces this entirely.
 */
const DEFAULT_DEV_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

export interface MockAuthProviderOptions {
  /** Override the dev private key used to sign. */
  privateKey?: `0x${string}`;
}

/**
 * Mock AuthProvider backed by a local viem account.
 *
 * - `getAddress` / `signTypedData` use a `privateKeyToAccount` account so
 *   EIP-712 signatures round-trip with the shared helpers.
 * - `sendSponsoredTx` returns a deterministic, simulated tx hash (no chain
 *   interaction) so consumer flows can be exercised without a live network.
 * - `login` / `logout` manage a simple in-memory session flag.
 */
export class MockAuthProvider implements AuthProvider {
  private readonly account: PrivateKeyAccount;
  private loggedIn = false;

  constructor(options: MockAuthProviderOptions = {}) {
    const key =
      options.privateKey ??
      (process.env.NEXT_PUBLIC_MOCK_PRIVATE_KEY as `0x${string}` | undefined) ??
      DEFAULT_DEV_PRIVATE_KEY;
    this.account = privateKeyToAccount(key);
  }

  async login(): Promise<void> {
    this.loggedIn = true;
  }

  async logout(): Promise<void> {
    this.loggedIn = false;
  }

  async getAddress(): Promise<`0x${string}` | null> {
    return this.loggedIn ? this.account.address : null;
  }

  async signTypedData(data: Parameters<AuthProvider["signTypedData"]>[0]) {
    return this.account.signTypedData(data);
  }

  async sendSponsoredTx(tx: TxRequest): Promise<`0x${string}`> {
    // Simulate a sponsored transaction by returning a deterministic pseudo-hash
    // derived from the request. No value moves and no network is touched.
    const seed = `${tx.to}:${tx.data ?? "0x"}:${tx.value?.toString() ?? "0"}:${Date.now()}`;
    return keccak256(toHex(seed));
  }
}
