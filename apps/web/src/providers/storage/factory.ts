import { MockStorageProvider } from "./mock";
import type { StorageProvider, StorageProviderKind } from "./types";

/**
 * Resolve the configured provider kind from the environment. Defaults to
 * `"mock"` when unset or unrecognized, so local development works with no
 * configuration.
 */
export function resolveStorageProviderKind(
  raw: string | undefined = process.env.NEXT_PUBLIC_STORAGE_PROVIDER,
): StorageProviderKind {
  return raw === "pinata" ? "pinata" : "mock";
}

let cached: StorageProvider | null = null;

/**
 * Provider factory keyed by `NEXT_PUBLIC_STORAGE_PROVIDER`.
 *
 * Only `"mock"` is implemented today; `"pinata"` throws until the Pinata/IPFS
 * implementation lands. That is the documented drop-in point: implement a
 * `PinataStorageProvider` against the same `StorageProvider` interface and add
 * a `case "pinata"` here — no consumer code changes (Requirement R11.3).
 * Consumers call `getStorageProvider()` and depend only on the interface.
 */
export function createStorageProvider(
  kind: StorageProviderKind = resolveStorageProviderKind(),
): StorageProvider {
  switch (kind) {
    case "mock":
      return new MockStorageProvider();
    case "pinata":
      throw new Error(
        "Pinata StorageProvider is not implemented yet. Set NEXT_PUBLIC_STORAGE_PROVIDER=mock.",
      );
    default: {
      // Exhaustiveness guard: adding a new kind without handling it is a type error.
      const _never: never = kind;
      throw new Error(`Unknown StorageProvider kind: ${String(_never)}`);
    }
  }
}

/** Memoized singleton accessor used by consumers throughout the app. */
export function getStorageProvider(): StorageProvider {
  if (!cached) {
    cached = createStorageProvider();
  }
  return cached;
}

/** Reset the memoized instance (used by tests). */
export function resetStorageProvider(): void {
  cached = null;
}
