import type { TypedDataDefinition } from "viem";

/**
 * A transaction request the AuthProvider can send on the user's behalf. With a
 * paymaster (ERC-4337) this is sponsored so the user pays no gas. Fields are
 * intentionally minimal; the real implementation may extend this.
 */
export interface TxRequest {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

/**
 * The authentication + account-abstraction boundary.
 *
 * Consumers depend only on this interface. A mock implementation (local viem
 * account) ships first; a Privy + ERC-4337 paymaster implementation can be
 * dropped in behind the same interface via the factory, without changing
 * consumer code (Requirement R8).
 */
export interface AuthProvider {
  /** Begin a session (social login in the real impl; in-memory in the mock). */
  login(): Promise<void>;
  /** End the session. */
  logout(): Promise<void>;
  /** The active wallet address, or null when logged out. */
  getAddress(): Promise<`0x${string}` | null>;
  /** Sign EIP-712 typed data (gasless). */
  signTypedData(data: TypedDataDefinition): Promise<`0x${string}`>;
  /** Submit a (sponsored) transaction and return its hash. */
  sendSponsoredTx(tx: TxRequest): Promise<`0x${string}`>;
}

/** Supported provider kinds, selected via `NEXT_PUBLIC_AUTH_PROVIDER`. */
export type AuthProviderKind = "mock" | "privy";
