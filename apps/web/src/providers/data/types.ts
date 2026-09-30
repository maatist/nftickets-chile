/**
 * DataProvider abstraction + frontend view models.
 *
 * The view models below (`EventView`, `TierView`, `TicketView`,
 * `AnalyticsView`) are the STABLE contract between the UI and any data source.
 * They are defined ONCE here and consumed identically by:
 *   - the mock DataProvider (fixtures) — implemented now (Task 9), and
 *   - the GraphQL DataProvider (subgraph) — implemented later (Task 12).
 *
 * IMPORTANT (Task 12): the GraphQL provider MUST return these exact shapes so
 * the swap behind `NEXT_PUBLIC_DATA_PROVIDER` is transparent to components. Do
 * not change these fields without updating both providers and all consumers.
 *
 * Design conventions:
 *  - All monetary amounts are expressed as decimal strings in the smallest unit
 *    (wei for native, base units for ERC-20) to avoid `bigint` serialization
 *    issues across the GraphQL boundary and to keep the shapes JSON-friendly.
 *  - `eventId`, `tier`, and `serial` are strings for the same reason; callers
 *    convert to `bigint` when building on-chain payloads.
 *  - Addresses are lowercase `0x`-prefixed hex strings.
 */

/** A single ticket tier within an event (General, VIP, Early Bird, ...). */
export interface TierView {
  /** Tier index within the event, as a decimal string (e.g. "0", "1"). */
  tier: string;
  /** Human-readable tier name. */
  name: string;
  /** Total supply configured for the tier. */
  maxSupply: number;
  /** Units minted (sold) so far. */
  minted: number;
  /** Base price, smallest-unit decimal string. */
  price: string;
  /** Resale price cap, smallest-unit decimal string. */
  maxResalePrice: string;
  /** Payment token address; the zero address means native (ETH). */
  payToken: `0x${string}`;
  /** Payment token symbol for display (e.g. "ETH", "USDC"). */
  payTokenSymbol: string;
}

/** An event as shown in the discovery feed. */
export interface EventView {
  /** Event identifier, as a decimal string. */
  eventId: string;
  /** Event title. */
  name: string;
  /** Short description for the discovery card. */
  description: string;
  /** Cover image URI (may be an IPFS/https URL). */
  imageUrl: string;
  /** Free-form venue / location label. */
  location: string;
  /** Event start time as an ISO-8601 string. */
  startsAt: string;
  /** Organizer wallet address. */
  organizer: `0x${string}`;
  /** Tiers available for this event. */
  tiers: TierView[];
}

/** A ticket owned by a user, shown in the "My Tickets" dashboard. */
export interface TicketView {
  /** Owning event id, decimal string. */
  eventId: string;
  /** Event title (denormalized for convenient rendering). */
  eventName: string;
  /** Cover image URI (denormalized). */
  imageUrl: string;
  /** Venue / location label (denormalized). */
  location: string;
  /** Event start time, ISO-8601 (denormalized). */
  startsAt: string;
  /** Tier index within the event, decimal string. */
  tier: string;
  /** Tier name (denormalized). */
  tierName: string;
  /** Individual serial within (eventId, tier), decimal string. */
  serial: string;
  /** Current owner address. */
  owner: `0x${string}`;
  /** Whether the ticket has been validated at the gate. */
  used: boolean;
}

/** Aggregated analytics for an organizer's event. */
export interface AnalyticsView {
  /** Event id the analytics belong to, decimal string. */
  eventId: string;
  /** Total tickets sold across all tiers. */
  totalSold: number;
  /** Total tickets validated (entered) across all tiers. */
  totalValidated: number;
  /**
   * Gross revenue per settlement token, keyed by token symbol, as
   * smallest-unit decimal strings.
   */
  revenueByToken: Record<string, string>;
  /** Per-tier breakdown of sales and validations. */
  perTier: Array<{
    tier: string;
    name: string;
    sold: number;
    validated: number;
  }>;
}

/**
 * The data-access boundary consumed by the user portal and organizer
 * dashboard. Consumers depend only on this interface; the concrete
 * implementation (mock fixtures vs. subgraph GraphQL) is chosen by the factory
 * via `NEXT_PUBLIC_DATA_PROVIDER` (Requirement R9 / R12).
 */
export interface DataProvider {
  /** List all events for the discovery feed. */
  listEvents(): Promise<EventView[]>;
  /** List the tickets owned by `owner` (address, case-insensitive). */
  getMyTickets(owner: string): Promise<TicketView[]>;
  /** Aggregated sales/validation analytics for a single event. */
  getOrganizerAnalytics(eventId: string): Promise<AnalyticsView>;
}

/** Supported provider kinds, selected via `NEXT_PUBLIC_DATA_PROVIDER`. */
export type DataProviderKind = "mock" | "subgraph";
