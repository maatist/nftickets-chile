import { EVENT_FIXTURES, TICKET_FIXTURES } from "./fixtures";
import type {
  AnalyticsView,
  DataProvider,
  EventView,
  TicketView,
} from "./types";

export interface MockDataProviderOptions {
  /** Override the event fixtures (used by tests). */
  events?: EventView[];
  /** Override the ticket fixtures (used by tests). */
  tickets?: TicketView[];
  /** Simulated latency in ms per call. Defaults to 0 in tests. */
  latencyMs?: number;
}

const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * Mock DataProvider backed by in-repo fixtures.
 *
 * Mirrors the shape the GraphQL provider (Task 12) will return, so swapping via
 * `NEXT_PUBLIC_DATA_PROVIDER` is transparent to consumers. Returns deep copies
 * so callers cannot mutate the shared fixtures.
 */
export class MockDataProvider implements DataProvider {
  private readonly events: EventView[];
  private readonly tickets: TicketView[];
  private readonly latencyMs: number;

  constructor(options: MockDataProviderOptions = {}) {
    this.events = options.events ?? EVENT_FIXTURES;
    this.tickets = options.tickets ?? TICKET_FIXTURES;
    this.latencyMs = options.latencyMs ?? 0;
  }

  async listEvents(): Promise<EventView[]> {
    await delay(this.latencyMs);
    return this.events.map((event) => ({
      ...event,
      tiers: event.tiers.map((tier) => ({ ...tier })),
    }));
  }

  async getMyTickets(owner: string): Promise<TicketView[]> {
    await delay(this.latencyMs);
    const normalized = owner.toLowerCase();
    return this.tickets
      .filter((ticket) => ticket.owner.toLowerCase() === normalized)
      .map((ticket) => ({ ...ticket }));
  }

  async getOrganizerAnalytics(eventId: string): Promise<AnalyticsView> {
    await delay(this.latencyMs);
    const event = this.events.find((e) => e.eventId === eventId);
    if (!event) {
      return {
        eventId,
        totalSold: 0,
        totalValidated: 0,
        revenueByToken: {},
        perTier: [],
      };
    }

    const revenueByToken: Record<string, bigint> = {};
    let totalSold = 0;
    let totalValidated = 0;

    const perTier = event.tiers.map((tier) => {
      const sold = tier.minted;
      // Derive validated counts from the ticket fixtures for this event/tier,
      // so analytics stay internally consistent with "My Tickets".
      const validated = this.tickets.filter(
        (t) => t.eventId === eventId && t.tier === tier.tier && t.used,
      ).length;

      totalSold += sold;
      totalValidated += validated;

      const gross = BigInt(tier.price) * BigInt(sold);
      revenueByToken[tier.payTokenSymbol] =
        (revenueByToken[tier.payTokenSymbol] ?? 0n) + gross;

      return { tier: tier.tier, name: tier.name, sold, validated };
    });

    return {
      eventId,
      totalSold,
      totalValidated,
      revenueByToken: Object.fromEntries(
        Object.entries(revenueByToken).map(([symbol, amount]) => [
          symbol,
          amount.toString(),
        ]),
      ),
      perTier,
    };
  }
}
