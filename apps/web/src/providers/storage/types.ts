/**
 * StorageProvider abstraction + event metadata model.
 *
 * The organizer dashboard uploads a cover image and a metadata document when
 * creating an event. Both go through this boundary so the concrete storage
 * backend is substitutable: a mock (in-memory, returns fake `ipfs://` URIs)
 * ships first, and a Pinata/IPFS implementation can be dropped in behind the
 * same interface via the factory, without changing consumer code
 * (Requirement R11.2 / R11.3).
 */

/** A single tier as captured in the uploaded event metadata document. */
export interface EventMetadataTier {
  /** Tier index within the event, decimal string (e.g. "0", "1"). */
  tier: string;
  /** Human-readable tier name (e.g. "General", "VIP"). */
  name: string;
  /** Total supply configured for the tier. */
  maxSupply: number;
  /** Base price, smallest-unit decimal string (wei / token base units). */
  price: string;
  /** Resale price cap, smallest-unit decimal string. */
  maxResalePrice: string;
  /** Payment token address; the zero address means native (ETH). */
  payToken: `0x${string}`;
  /** Payment token symbol for display (e.g. "ETH", "USDC"). */
  payTokenSymbol: string;
}

/**
 * The metadata document uploaded for an event. Mirrors common NFT metadata
 * conventions (`name`, `description`, `image`) plus ticketing-specific fields
 * so the same document can back the discovery feed and per-token metadata.
 */
export interface EventMetadata {
  /** Event identifier, decimal string. */
  eventId: string;
  /** Event title. */
  name: string;
  /** Long-form description. */
  description: string;
  /** Cover image URI (typically the value returned by `uploadImage`). */
  image: string;
  /** Free-form venue / location label. */
  location: string;
  /** Event start time as an ISO-8601 string. */
  startsAt: string;
  /** The tiers configured for this event. */
  tiers: EventMetadataTier[];
}

/**
 * The storage boundary consumed by the organizer dashboard.
 *
 * Consumers depend only on this interface. Both methods return a URI (an
 * `ipfs://<cid>` string in the mock and the real Pinata impl) that is stored on
 * the event/token so clients can resolve the asset later.
 */
export interface StorageProvider {
  /** Upload a binary image and return its URI. */
  uploadImage(file: Blob): Promise<string>;
  /** Upload the event metadata document and return its URI. */
  uploadMetadata(meta: EventMetadata): Promise<string>;
}

/** Supported provider kinds, selected via `NEXT_PUBLIC_STORAGE_PROVIDER`. */
export type StorageProviderKind = "mock" | "pinata";
