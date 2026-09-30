import { afterEach, describe, expect, it } from "vitest";
import { MockDataProvider } from "./mock";
import { GraphQlDataProvider } from "./subgraph";
import { DEMO_OWNER, EVENT_FIXTURES } from "./fixtures";
import {
  createDataProvider,
  getDataProvider,
  resetDataProvider,
  resolveDataProviderKind,
} from "./factory";

afterEach(() => {
  resetDataProvider();
});

describe("data provider factory", () => {
  it("defaults to the mock kind when the env flag is unset", () => {
    expect(resolveDataProviderKind(undefined)).toBe("mock");
  });

  it("falls back to mock for unrecognized values", () => {
    expect(resolveDataProviderKind("nonsense")).toBe("mock");
  });

  it("resolves the subgraph kind when explicitly set", () => {
    expect(resolveDataProviderKind("subgraph")).toBe("subgraph");
  });

  it("creates a MockDataProvider for the mock kind", () => {
    expect(createDataProvider("mock")).toBeInstanceOf(MockDataProvider);
  });

  it("throws for the subgraph kind when no subgraph URL is configured", () => {
    const previous = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
    delete process.env.NEXT_PUBLIC_SUBGRAPH_URL;
    try {
      expect(() => createDataProvider("subgraph")).toThrow(/subgraph url/i);
    } finally {
      if (previous !== undefined) {
        process.env.NEXT_PUBLIC_SUBGRAPH_URL = previous;
      }
    }
  });

  it("creates a GraphQlDataProvider for the subgraph kind when a URL is set", () => {
    const previous = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
    process.env.NEXT_PUBLIC_SUBGRAPH_URL = "https://example.com/subgraph";
    try {
      expect(createDataProvider("subgraph")).toBeInstanceOf(
        GraphQlDataProvider,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_SUBGRAPH_URL;
      } else {
        process.env.NEXT_PUBLIC_SUBGRAPH_URL = previous;
      }
    }
  });

  it("getDataProvider() returns a memoized mock instance", () => {
    const a = getDataProvider();
    const b = getDataProvider();
    expect(a).toBeInstanceOf(MockDataProvider);
    expect(a).toBe(b);
  });
});

describe("mock data provider", () => {
  it("lists events from the fixtures", async () => {
    const provider = new MockDataProvider();
    const events = await provider.listEvents();
    expect(events).toHaveLength(EVENT_FIXTURES.length);
    expect(events.map((e) => e.name)).toEqual(
      EVENT_FIXTURES.map((e) => e.name),
    );
  });

  it("returns copies so callers cannot mutate the fixtures", async () => {
    const provider = new MockDataProvider();
    const [first] = await provider.listEvents();
    expect(first).toBeDefined();
    first!.name = "mutated";
    const [refetched] = await provider.listEvents();
    expect(refetched!.name).not.toBe("mutated");
  });

  it("returns only tickets owned by the given address (case-insensitive)", async () => {
    const provider = new MockDataProvider();
    const tickets = await provider.getMyTickets(DEMO_OWNER.toUpperCase());
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.every((t) => t.owner.toLowerCase() === DEMO_OWNER)).toBe(
      true,
    );
  });

  it("returns no tickets for an unknown owner", async () => {
    const provider = new MockDataProvider();
    const tickets = await provider.getMyTickets(
      "0x000000000000000000000000000000000000dead",
    );
    expect(tickets).toEqual([]);
  });

  it("aggregates analytics consistently with the fixtures", async () => {
    const provider = new MockDataProvider();
    const analytics = await provider.getOrganizerAnalytics("1");
    expect(analytics.eventId).toBe("1");
    const event = EVENT_FIXTURES.find((e) => e.eventId === "1");
    const expectedSold = event!.tiers.reduce((sum, t) => sum + t.minted, 0);
    expect(analytics.totalSold).toBe(expectedSold);
    expect(analytics.perTier).toHaveLength(event!.tiers.length);
  });
});
