import { ZERO_ADDRESS } from "@nftickets/shared";
import type {
  AnalyticsView,
  DataProvider,
  EventView,
  TicketView,
  TierView,
} from "./types";

/**
 * GraphQL DataProvider backed by the deployed subgraph (packages/subgraph).
 *
 * It issues GraphQL queries (fetch POST) against `NEXT_PUBLIC_SUBGRAPH_URL` and
 * maps the subgraph entities into the SAME stable view models the mock provider
 * returns (`EventView` / `TicketView` / `AnalyticsView`), so swapping providers
 * behind `NEXT_PUBLIC_DATA_PROVIDER` is transparent to components.
 *
 * DISPLAY-ONLY FALLBACKS: the subgraph indexes on-chain logs only, which do not
 * carry an event's name, description, image, location, or start time (those live
 * in IPFS metadata uploaded via the StorageProvider). For those fields this
 * provider substitutes documented fallbacks so the view-model shapes remain
 * identical to the mock. When metadata resolution is wired up later, only these
 * fallbacks need to change — the shapes stay the same.
 */

// ---------------------------------------------------------------------------
// Subgraph response shapes (only the fields we query).
// ---------------------------------------------------------------------------

interface SubgraphTier {
  tier: string;
  maxSupply: string;
  minted: string;
  price: string;
  maxResalePrice: string;
  payToken: string;
}

interface SubgraphEvent {
  eventId: string;
  organizer: string;
  tiers: SubgraphTier[];
}

interface SubgraphTicket {
  serial: string;
  owner: string;
  used: boolean;
  event: { eventId: string };
  tier: { tier: string };
}

interface SubgraphValidationForEvent {
  id: string;
}

// ---------------------------------------------------------------------------
// Display-only fallbacks (documented; replaced once IPFS metadata is wired in).
// ---------------------------------------------------------------------------

const FALLBACK_IMAGE = "/placeholder-event.svg";
const FALLBACK_LOCATION = "TBA";
const FALLBACK_STARTS_AT = "";

function fallbackEventName(eventId: string): string {
  return `Event #${eventId}`;
}

function fallbackTierName(tier: string): string {
  return `Tier ${tier}`;
}

/** Best-effort payment-token symbol from the token address. */
function paymentTokenSymbol(payToken: string): string {
  return payToken.toLowerCase() === ZERO_ADDRESS ? "ETH" : "TOKEN";
}

function toLowerAddress(value: string): `0x${string}` {
  return value.toLowerCase() as `0x${string}`;
}

// ---------------------------------------------------------------------------
// Mappers: subgraph entity -> view model.
// ---------------------------------------------------------------------------

function mapTier(tier: SubgraphTier): TierView {
  return {
    tier: tier.tier,
    name: fallbackTierName(tier.tier),
    maxSupply: Number(tier.maxSupply),
    minted: Number(tier.minted),
    price: tier.price,
    maxResalePrice: tier.maxResalePrice,
    payToken: toLowerAddress(tier.payToken),
    payTokenSymbol: paymentTokenSymbol(tier.payToken),
  };
}

function mapEvent(event: SubgraphEvent): EventView {
  return {
    eventId: event.eventId,
    name: fallbackEventName(event.eventId),
    description: "",
    imageUrl: FALLBACK_IMAGE,
    location: FALLBACK_LOCATION,
    startsAt: FALLBACK_STARTS_AT,
    organizer: toLowerAddress(event.organizer),
    tiers: [...event.tiers]
      .sort((a, b) => Number(a.tier) - Number(b.tier))
      .map(mapTier),
  };
}

function mapTicket(ticket: SubgraphTicket): TicketView {
  const eventId = ticket.event.eventId;
  const tier = ticket.tier.tier;
  return {
    eventId,
    eventName: fallbackEventName(eventId),
    imageUrl: FALLBACK_IMAGE,
    location: FALLBACK_LOCATION,
    startsAt: FALLBACK_STARTS_AT,
    tier,
    tierName: fallbackTierName(tier),
    serial: ticket.serial,
    owner: toLowerAddress(ticket.owner),
    used: ticket.used,
  };
}

// ---------------------------------------------------------------------------
// GraphQL queries.
// ---------------------------------------------------------------------------

const LIST_EVENTS_QUERY = /* GraphQL */ `
  query ListEvents {
    events(first: 100, orderBy: createdAt, orderDirection: desc) {
      eventId
      organizer
      tiers(first: 100) {
        tier
        maxSupply
        minted
        price
        maxResalePrice
        payToken
      }
    }
  }
`;

const MY_TICKETS_QUERY = /* GraphQL */ `
  query MyTickets($owner: Bytes!) {
    tickets(first: 1000, where: { owner: $owner }) {
      serial
      owner
      used
      event {
        eventId
      }
      tier {
        tier
      }
    }
  }
`;

const ANALYTICS_QUERY = /* GraphQL */ `
  query EventAnalytics($eventId: ID!) {
    event(id: $eventId) {
      eventId
      organizer
      tiers(first: 100) {
        tier
        maxSupply
        minted
        price
        maxResalePrice
        payToken
      }
    }
    validations(first: 1000, where: { ticket_: { event: $eventId } }) {
      id
    }
    tickets(first: 1000, where: { event: $eventId, used: true }) {
      serial
      used
      tier {
        tier
      }
    }
  }
`;

interface GraphQlError {
  message: string;
}

interface GraphQlResponse<T> {
  data?: T;
  errors?: GraphQlError[];
}

export interface GraphQlDataProviderOptions {
  /** Subgraph GraphQL endpoint. Defaults to `NEXT_PUBLIC_SUBGRAPH_URL`. */
  url?: string;
  /** Injectable fetch (tests). Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class GraphQlDataProvider implements DataProvider {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GraphQlDataProviderOptions = {}) {
    const url = options.url ?? process.env.NEXT_PUBLIC_SUBGRAPH_URL;
    if (!url) {
      throw new Error(
        "GraphQlDataProvider requires a subgraph URL. Set NEXT_PUBLIC_SUBGRAPH_URL " +
          "or pass { url } explicitly.",
      );
    }
    this.url = url;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(
        `Subgraph request failed with HTTP ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as GraphQlResponse<T>;
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(
        `Subgraph GraphQL error: ${payload.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!payload.data) {
      throw new Error("Subgraph response contained no data.");
    }
    return payload.data;
  }

  async listEvents(): Promise<EventView[]> {
    const data = await this.query<{ events: SubgraphEvent[] }>(
      LIST_EVENTS_QUERY,
    );
    return data.events.map(mapEvent);
  }

  async getMyTickets(owner: string): Promise<TicketView[]> {
    const data = await this.query<{ tickets: SubgraphTicket[] }>(
      MY_TICKETS_QUERY,
      { owner: owner.toLowerCase() },
    );
    return data.tickets.map(mapTicket);
  }

  async getOrganizerAnalytics(eventId: string): Promise<AnalyticsView> {
    const data = await this.query<{
      event: SubgraphEvent | null;
      validations: SubgraphValidationForEvent[];
      tickets: Array<{ used: boolean; tier: { tier: string } }>;
    }>(ANALYTICS_QUERY, { eventId });

    const event = data.event;
    if (!event) {
      return {
        eventId,
        totalSold: 0,
        totalValidated: 0,
        revenueByToken: {},
        perTier: [],
      };
    }

    const validatedByTier = new Map<string, number>();
    for (const ticket of data.tickets) {
      if (ticket.used) {
        const key = ticket.tier.tier;
        validatedByTier.set(key, (validatedByTier.get(key) ?? 0) + 1);
      }
    }

    const revenueByToken: Record<string, bigint> = {};
    let totalSold = 0;
    let totalValidated = 0;

    const perTier = [...event.tiers]
      .sort((a, b) => Number(a.tier) - Number(b.tier))
      .map((tier) => {
        const sold = Number(tier.minted);
        const validated = validatedByTier.get(tier.tier) ?? 0;
        totalSold += sold;
        totalValidated += validated;

        const symbol = paymentTokenSymbol(tier.payToken);
        const gross = BigInt(tier.price) * BigInt(tier.minted);
        revenueByToken[symbol] = (revenueByToken[symbol] ?? 0n) + gross;

        return {
          tier: tier.tier,
          name: fallbackTierName(tier.tier),
          sold,
          validated,
        };
      });

    // Cross-check against the total validations count for the event.
    totalValidated = Math.max(totalValidated, data.validations.length);

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
