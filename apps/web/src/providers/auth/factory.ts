import { MockAuthProvider } from "./mock";
import type { AuthProvider, AuthProviderKind } from "./types";

/**
 * Resolve the configured provider kind from the environment. Defaults to
 * `"mock"` when unset or unrecognized, so local development works with no
 * configuration.
 */
export function resolveAuthProviderKind(
  raw: string | undefined = process.env.NEXT_PUBLIC_AUTH_PROVIDER,
): AuthProviderKind {
  return raw === "privy" ? "privy" : "mock";
}

let cached: AuthProvider | null = null;

/**
 * Provider factory keyed by `NEXT_PUBLIC_AUTH_PROVIDER`.
 *
 * Only `"mock"` is implemented today; `"privy"` throws until the Privy +
 * paymaster implementation lands. Consumers call `getAuthProvider()` and depend
 * only on the `AuthProvider` interface, so swapping implementations is a config
 * change (Requirement R8).
 */
export function createAuthProvider(
  kind: AuthProviderKind = resolveAuthProviderKind(),
): AuthProvider {
  switch (kind) {
    case "mock":
      return new MockAuthProvider();
    case "privy":
      throw new Error(
        "Privy AuthProvider is not implemented yet. Set NEXT_PUBLIC_AUTH_PROVIDER=mock.",
      );
    default: {
      // Exhaustiveness guard: adding a new kind without handling it is a type error.
      const _never: never = kind;
      throw new Error(`Unknown AuthProvider kind: ${String(_never)}`);
    }
  }
}

/** Memoized singleton accessor used by consumers throughout the app. */
export function getAuthProvider(): AuthProvider {
  if (!cached) {
    cached = createAuthProvider();
  }
  return cached;
}

/** Reset the memoized instance (used by tests). */
export function resetAuthProvider(): void {
  cached = null;
}
