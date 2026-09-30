/**
 * EIP-712 typed-data helpers for ticket payloads.
 *
 * A ticket's authenticity is proven off-chain: the owner signs a `TicketPayload`
 * as EIP-712 typed data and the gate scanner verifies the signature against the
 * claimed owner. Verification helpers return booleans on signature mismatch
 * rather than throwing, so callers can branch on validity cleanly.
 */
import {
  verifyTypedData,
  type TypedDataDefinition,
} from "viem";

/** EIP-712 domain name for ticket signatures. */
export const TICKET_DOMAIN_NAME = "NFTicketsChile" as const;

/** EIP-712 domain version for ticket signatures. */
export const TICKET_DOMAIN_VERSION = "1" as const;

/**
 * The default freshness window (in seconds) for a dynamic QR payload.
 * The scanner rejects payloads whose timestamp is older than this.
 */
export const DEFAULT_TIMESTAMP_WINDOW_SECONDS = 30 as const;

/** The off-chain payload embedded in a dynamic ticket QR code. */
export interface TicketPayload {
  eventId: bigint;
  tier: bigint;
  serial: bigint;
  owner: `0x${string}`;
  timestamp: bigint;
  nonce: bigint;
}

/**
 * The EIP-712 `Ticket` type definition. `eventId`, `tier`, `serial`,
 * `timestamp`, and `nonce` are `uint256`; `owner` is an `address`.
 */
export const ticketTypes = {
  Ticket: [
    { name: "eventId", type: "uint256" },
    { name: "tier", type: "uint256" },
    { name: "serial", type: "uint256" },
    { name: "owner", type: "address" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

/**
 * Build the EIP-712 typed data definition for a ticket payload. The result can
 * be passed directly to viem's `signTypedData` / account `signTypedData`, and
 * mirrors what {@link verifyTicketSignature} expects.
 */
export function buildTicketTypedData(
  payload: TicketPayload,
  chainId: number,
  verifyingContract: `0x${string}`,
): TypedDataDefinition<typeof ticketTypes, "Ticket"> {
  return {
    domain: {
      name: TICKET_DOMAIN_NAME,
      version: TICKET_DOMAIN_VERSION,
      chainId,
      verifyingContract,
    },
    types: ticketTypes,
    primaryType: "Ticket",
    message: {
      eventId: payload.eventId,
      tier: payload.tier,
      serial: payload.serial,
      owner: payload.owner,
      timestamp: payload.timestamp,
      nonce: payload.nonce,
    },
  };
}

/**
 * Verify that `signature` over `payload` was produced by `expectedOwner`.
 *
 * Returns `true` when the recovered signer matches `expectedOwner`, `false`
 * otherwise. Does not throw on signature mismatch.
 */
export async function verifyTicketSignature(args: {
  payload: TicketPayload;
  signature: `0x${string}`;
  expectedOwner: `0x${string}`;
  chainId: number;
  verifyingContract: `0x${string}`;
}): Promise<boolean> {
  const { payload, signature, expectedOwner, chainId, verifyingContract } =
    args;
  const typedData = buildTicketTypedData(payload, chainId, verifyingContract);

  return verifyTypedData({
    address: expectedOwner,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
    signature,
  });
}

/**
 * Timestamp-window / freshness check for a dynamic QR payload.
 *
 * Returns `true` when the payload is fresh, i.e. `now - timestamp` is within
 * `[0, windowSeconds]`. Payloads dated in the future (beyond the window) and
 * payloads older than the window are considered stale and return `false`.
 *
 * @param timestamp     The payload's `timestamp` field (unix seconds).
 * @param now           The current time (unix seconds).
 * @param windowSeconds The allowed freshness window in seconds.
 */
export function isTimestampFresh(
  timestamp: bigint,
  now: bigint,
  windowSeconds: bigint | number = DEFAULT_TIMESTAMP_WINDOW_SECONDS,
): boolean {
  const window = BigInt(windowSeconds);
  const delta = now - timestamp;
  return delta >= 0n && delta <= window;
}
