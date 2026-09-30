import { MockDataProvider } from "./mock";
import { GraphQlDataProvider } from "./subgraph";
import type { DataProvider, DataProviderKind } from "./types";

/**
 * Resolve the configured provider kind from the environment. Defaults to
 * `"mock"` when unset or unrecognized, so local development works with no
 * configuration.
 */
export function resolveDataProviderKind(
  raw: string | undefined = process.env.NEXT_PUBLIC_DATA_PROVIDER,
): DataProviderKind {
  return raw === "subgraph" ? "subgraph" : "mock";
}

let cached: DataProvider | null = null;

/**
 * Provider factory keyed by `NEXT_PUBLIC_DATA_PROVIDER`.
 *
 * `"mock"` uses in-repo fixtures; `"subgraph"` uses the GraphQL provider backed
 * by the deployed subgraph (reads `NEXT_PUBLIC_SUBGRAPH_URL`). Consumers call
 * `getDataProvider()` and depend only on the `DataProvider` interface, so
 * swapping implementations is a config change (Requirements R9 / R12).
 */
export function createDataProvider(
  kind: DataProviderKind = resolveDataProviderKind(),
): DataProvider {
  switch (kind) {
    case "mock":
      return new MockDataProvider();
    case "subgraph":
      return new GraphQlDataProvider();
    default: {
      // Exhaustiveness guard: adding a new kind without handling it is a type error.
      const _never: never = kind;
      throw new Error(`Unknown DataProvider kind: ${String(_never)}`);
    }
  }
}

/** Memoized singleton accessor used by consumers throughout the app. */
export function getDataProvider(): DataProvider {
  if (!cached) {
    cached = createDataProvider();
  }
  return cached;
}

/** Reset the memoized instance (used by tests). */
export function resetDataProvider(): void {
  cached = null;
}
