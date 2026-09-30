import { describe, expect, it, vi } from "vitest";
import { GraphQlDataProvider } from "./subgraph";

const URL = "https://api.thegraph.com/subgraphs/name/nftickets/base-sepolia";
const ZERO = "0x0000000000000000000000000000000000000000";
const OWNER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

/** Build a fetch mock that returns a canned GraphQL payload as JSON. */
function mockFetch(payload: unknown, init?: { ok?: boolean; status?: number }) {
  return vi.fn(async () =>
    ({
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      statusText: "OK",
      json: async () => payload,
    }) as unknown as Response,
  );
}

describe("GraphQlDataProvider", () => {
  it("requires a subgraph URL", () => {
    expect(
      () => new GraphQlDataProvider({ url: undefined, fetchImpl: mockFetch({}) }),
    ).toThrow(/subgraph url/i);
  });

  it("maps events into EventView shapes with display fallbacks", async () => {
    const fetchImpl = mockFetch({
      data: {
        events: [
          {
            eventId: "1",
            organizer: "0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            tiers: [
              {
                tier: "1",
                maxSupply: "500",
                minted: "410",
                price: "120000000000000000",
                maxResalePrice: "150000000000000000",
                payToken: ZERO,
              },
              {
                tier: "0",
                maxSupply: "5000",
                minted: "3120",
                price: "45000000000000000",
                maxResalePrice: "54000000000000000",
                payToken: ZERO,
              },
            ],
          },
        ],
      },
    });

    const provider = new GraphQlDataProvider({ url: URL, fetchImpl });
    const events = await provider.listEvents();

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = fetchImpl.mock.calls[0]!;
    expect(calledUrl).toBe(URL);
    expect(calledInit?.method).toBe("POST");

    expect(events).toHaveLength(1);
    const event = events[0]!;
    // Display-only fields use documented fallbacks.
    expect(event.eventId).toBe("1");
    expect(event.name).toBe("Event #1");
    expect(event.imageUrl).toBe("/placeholder-event.svg");
    expect(event.location).toBe("TBA");
    // Address lowercased.
    expect(event.organizer).toBe(OWNER);
    // Tiers sorted by index; amounts stay as strings.
    expect(event.tiers.map((t) => t.tier)).toEqual(["0", "1"]);
    expect(event.tiers[0]!.price).toBe("45000000000000000");
    expect(event.tiers[0]!.payTokenSymbol).toBe("ETH");
    expect(event.tiers[0]!.maxSupply).toBe(5000);
    expect(event.tiers[0]!.minted).toBe(3120);
  });

  it("maps tickets owned by an address and lowercases the query variable", async () => {
    const fetchImpl = mockFetch({
      data: {
        tickets: [
          {
            serial: "128",
            owner: OWNER,
            used: false,
            event: { eventId: "1" },
            tier: { tier: "1" },
          },
          {
            serial: "2044",
            owner: OWNER,
            used: true,
            event: { eventId: "1" },
            tier: { tier: "0" },
          },
        ],
      },
    });

    const provider = new GraphQlDataProvider({ url: URL, fetchImpl });
    const tickets = await provider.getMyTickets(OWNER.toUpperCase());

    // The owner variable is lowercased in the request body.
    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.variables.owner).toBe(OWNER);

    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toMatchObject({
      eventId: "1",
      tier: "1",
      serial: "128",
      owner: OWNER,
      used: false,
      eventName: "Event #1",
      tierName: "Tier 1",
    });
    expect(tickets[1]!.used).toBe(true);
  });

  it("aggregates analytics into an AnalyticsView", async () => {
    const fetchImpl = mockFetch({
      data: {
        event: {
          eventId: "1",
          organizer: OWNER,
          tiers: [
            {
              tier: "0",
              maxSupply: "5000",
              minted: "3120",
              price: "45000000000000000",
              maxResalePrice: "54000000000000000",
              payToken: ZERO,
            },
            {
              tier: "1",
              maxSupply: "500",
              minted: "410",
              price: "120000000000000000",
              maxResalePrice: "150000000000000000",
              payToken: ZERO,
            },
          ],
        },
        validations: [{ id: "1-0-1" }, { id: "1-1-1" }],
        tickets: [
          { used: true, tier: { tier: "0" } },
          { used: true, tier: { tier: "1" } },
        ],
      },
    });

    const provider = new GraphQlDataProvider({ url: URL, fetchImpl });
    const analytics = await provider.getOrganizerAnalytics("1");

    expect(analytics.eventId).toBe("1");
    expect(analytics.totalSold).toBe(3120 + 410);
    expect(analytics.totalValidated).toBe(2);
    expect(analytics.perTier).toHaveLength(2);
    expect(analytics.perTier[0]).toEqual({
      tier: "0",
      name: "Tier 0",
      sold: 3120,
      validated: 1,
    });
    // Revenue aggregated per token symbol as a decimal string.
    const expectedRevenue = (
      BigInt("45000000000000000") * 3120n +
      BigInt("120000000000000000") * 410n
    ).toString();
    expect(analytics.revenueByToken.ETH).toBe(expectedRevenue);
  });

  it("returns empty analytics when the event is not found", async () => {
    const fetchImpl = mockFetch({
      data: { event: null, validations: [], tickets: [] },
    });
    const provider = new GraphQlDataProvider({ url: URL, fetchImpl });
    const analytics = await provider.getOrganizerAnalytics("999");
    expect(analytics).toEqual({
      eventId: "999",
      totalSold: 0,
      totalValidated: 0,
      revenueByToken: {},
      perTier: [],
    });
  });

  it("throws on GraphQL errors", async () => {
    const fetchImpl = mockFetch({
      errors: [{ message: "bad query" }],
    });
    const provider = new GraphQlDataProvider({ url: URL, fetchImpl });
    await expect(provider.listEvents()).rejects.toThrow(/bad query/);
  });

  it("throws on non-OK HTTP responses", async () => {
    const fetchImpl = mockFetch({}, { ok: false, status: 500 });
    const provider = new GraphQlDataProvider({ url: URL, fetchImpl });
    await expect(provider.listEvents()).rejects.toThrow(/HTTP 500/);
  });
});
