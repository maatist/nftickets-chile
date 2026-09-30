import { encodeFunctionData } from "viem";
import {
  addresses,
  BASE_SEPOLIA_CHAIN_ID,
  eventTicketingAbi,
  ZERO_ADDRESS,
} from "@nftickets/shared";
import type { AuthProvider, TxRequest } from "@/providers/auth";
import type {
  EventMetadata,
  EventMetadataTier,
  StorageProvider,
} from "@/providers/storage";

/**
 * The organizer's event-creation form, in the shapes the UI collects. Numeric
 * on-chain values are captured as decimal strings in the SMALLEST unit (wei /
 * token base units) — the same convention the DataProvider view models use —
 * so there is no float rounding and conversion to `bigint` is lossless.
 */
export interface OrganizerTierForm {
  /** Tier index within the event, decimal string (e.g. "0", "1"). */
  tier: string;
  /** Human-readable tier name. */
  name: string;
  /** Total supply configured for the tier (> 0). */
  maxSupply: number;
  /** Base price, smallest-unit decimal string. */
  price: string;
  /** Resale price cap, smallest-unit decimal string (>= price). */
  maxResalePrice: string;
  /** Payment token address; the zero address means native (ETH). */
  payToken: `0x${string}`;
  /** Payment token symbol for display (e.g. "ETH", "USDC"). */
  payTokenSymbol: string;
}

export interface OrganizerEventForm {
  /** Event identifier, decimal string (must be unique on-chain). */
  eventId: string;
  /** Event title. */
  name: string;
  /** Long-form description. */
  description: string;
  /** Free-form venue / location label. */
  location: string;
  /** Event start time, ISO-8601 string. */
  startsAt: string;
  /** Cover image the organizer selected (uploaded via StorageProvider). */
  image?: Blob | null;
  /** One or more tiers to register with `addTier`. */
  tiers: OrganizerTierForm[];
}

/** A single on-chain call: target contract + encoded calldata. */
export interface EncodedCall {
  to: `0x${string}`;
  data: `0x${string}`;
  /** Which contract function this call invokes (for readable assertions). */
  functionName: "createEvent" | "addTier";
}

/** Validate a form before encoding; throws a descriptive error when invalid. */
export function validateEventForm(form: OrganizerEventForm): void {
  if (!/^\d+$/.test(form.eventId)) {
    throw new Error("Event id must be a positive integer.");
  }
  if (form.name.trim().length === 0) {
    throw new Error("Event name is required.");
  }
  if (form.tiers.length === 0) {
    throw new Error("Add at least one ticket tier.");
  }
  const seen = new Set<string>();
  for (const tier of form.tiers) {
    if (!/^\d+$/.test(tier.tier)) {
      throw new Error("Tier index must be a positive integer.");
    }
    if (seen.has(tier.tier)) {
      throw new Error(`Duplicate tier index "${tier.tier}".`);
    }
    seen.add(tier.tier);
    if (!Number.isInteger(tier.maxSupply) || tier.maxSupply <= 0) {
      throw new Error(`Tier "${tier.name}" must have a supply greater than 0.`);
    }
    if (!/^\d+$/.test(tier.price)) {
      throw new Error(`Tier "${tier.name}" price is invalid.`);
    }
    if (!/^\d+$/.test(tier.maxResalePrice)) {
      throw new Error(`Tier "${tier.name}" resale cap is invalid.`);
    }
    if (BigInt(tier.maxResalePrice) < BigInt(tier.price)) {
      throw new Error(
        `Tier "${tier.name}" resale cap must be >= its price.`,
      );
    }
  }
}

/**
 * Resolve the EventTicketing contract address for the active network.
 * Defaults to the Base Sepolia entry from the shared address book.
 */
export function eventTicketingAddress(
  chainId: number = BASE_SEPOLIA_CHAIN_ID,
): `0x${string}` {
  return addresses[chainId]?.eventTicketing ?? ZERO_ADDRESS;
}

/**
 * Encode the ordered list of on-chain calls for creating an event: one
 * `createEvent(eventId)` followed by one `addTier(...)` per tier. Pure and
 * deterministic so tests can assert the exact encoded calldata/args, mirroring
 * how the scanner pipeline was made testable.
 */
export function buildCreateEventCalls(
  form: OrganizerEventForm,
  contractAddress: `0x${string}` = eventTicketingAddress(),
): EncodedCall[] {
  validateEventForm(form);

  const eventId = BigInt(form.eventId);

  const createCall: EncodedCall = {
    to: contractAddress,
    functionName: "createEvent",
    data: encodeFunctionData({
      abi: eventTicketingAbi,
      functionName: "createEvent",
      args: [eventId],
    }),
  };

  const tierCalls: EncodedCall[] = form.tiers.map((tier) => ({
    to: contractAddress,
    functionName: "addTier",
    data: encodeFunctionData({
      abi: eventTicketingAbi,
      functionName: "addTier",
      args: [
        eventId,
        BigInt(tier.tier),
        BigInt(tier.maxSupply),
        BigInt(tier.price),
        BigInt(tier.maxResalePrice),
        tier.payToken,
      ],
    }),
  }));

  return [createCall, ...tierCalls];
}

/** Map the organizer form + uploaded image URI into the metadata document. */
export function buildEventMetadata(
  form: OrganizerEventForm,
  imageUri: string,
): EventMetadata {
  const tiers: EventMetadataTier[] = form.tiers.map((tier) => ({
    tier: tier.tier,
    name: tier.name,
    maxSupply: tier.maxSupply,
    price: tier.price,
    maxResalePrice: tier.maxResalePrice,
    payToken: tier.payToken,
    payTokenSymbol: tier.payTokenSymbol,
  }));

  return {
    eventId: form.eventId,
    name: form.name,
    description: form.description,
    image: imageUri,
    location: form.location,
    startsAt: form.startsAt,
    tiers,
  };
}

export interface SubmitEventCreationArgs {
  form: OrganizerEventForm;
  storage: StorageProvider;
  auth: AuthProvider;
  /** Override the contract address (tests). Defaults to the shared address. */
  contractAddress?: `0x${string}`;
}

export interface SubmitEventCreationResult {
  /** URI returned for the uploaded cover image (empty when no image). */
  imageUri: string;
  /** URI returned for the uploaded metadata document. */
  metadataUri: string;
  /** Tx hash of the `createEvent` call. */
  createTxHash: `0x${string}`;
  /** Tx hashes of each `addTier` call, in tier order. */
  tierTxHashes: `0x${string}`[];
}

/**
 * Orchestrate event creation end to end (Requirement R11.2):
 *  1. Upload the cover image via `StorageProvider.uploadImage` (if provided).
 *  2. Build + upload the metadata document via `uploadMetadata`.
 *  3. Encode and submit `createEvent(eventId)` then each `addTier(...)`
 *     through `AuthProvider.sendSponsoredTx` (gasless, ERC-4337 design).
 *
 * Kept free of React so it is unit-testable with spy providers: the test fills
 * a form, calls this, and asserts uploads happened and the encoded
 * createEvent/addTier args match.
 */
export async function submitEventCreation({
  form,
  storage,
  auth,
  contractAddress = eventTicketingAddress(),
}: SubmitEventCreationArgs): Promise<SubmitEventCreationResult> {
  validateEventForm(form);

  const imageUri = form.image ? await storage.uploadImage(form.image) : "";
  const metadataUri = await storage.uploadMetadata(
    buildEventMetadata(form, imageUri),
  );

  const calls = buildCreateEventCalls(form, contractAddress);
  const [createCall, ...tierCalls] = calls;
  if (!createCall) {
    // buildCreateEventCalls always returns createEvent first; defensive guard.
    throw new Error("Failed to encode createEvent call.");
  }

  const send = (call: EncodedCall): Promise<`0x${string}`> => {
    const tx: TxRequest = { to: call.to, data: call.data };
    return auth.sendSponsoredTx(tx);
  };

  // createEvent must land before tiers can be added; submit it first, then the
  // tiers in order.
  const createTxHash = await send(createCall);
  const tierTxHashes: `0x${string}`[] = [];
  for (const call of tierCalls) {
    tierTxHashes.push(await send(call));
  }

  return { imageUri, metadataUri, createTxHash, tierTxHashes };
}
