import {
  DEFAULT_TIMESTAMP_WINDOW_SECONDS,
  isTimestampFresh,
  verifyTicketSignature,
  type TicketPayload,
} from "@nftickets/shared";
import type { QrEnvelope } from "@/components/dynamic-ticket-qr";
import type { ScannerChainClient } from "./chain-client";

/**
 * The outcome states the gate scanner can land in. Mirrors Requirement R10:
 *  - `valid`            — signature valid, fresh, owned, unused; `validateTicket` fired.
 *  - `used`             — already validated on-chain (double-validation blocked).
 *  - `invalid-signature`— malformed envelope or signature does not match owner.
 *  - `expired`          — signature valid but timestamp outside the freshness window.
 *  - `owner-mismatch`   — on-chain serial owner differs from the claimed owner.
 *  - `offline-queued`   — offline: verified locally and queued for later submission.
 */
export type ScanState =
  | "valid"
  | "used"
  | "invalid-signature"
  | "expired"
  | "owner-mismatch"
  | "offline-queued";

/** A pending validation queued while offline, awaiting later submission. */
export interface QueuedValidation {
  eventId: string;
  tier: string;
  serial: string;
  owner: `0x${string}`;
  /** When the ticket was scanned (unix seconds), for auditing. */
  scannedAt: string;
}

export interface ScanResult {
  state: ScanState;
  /** Human-readable detail for the UI. */
  message: string;
  /** The parsed payload, when the envelope was well-formed. */
  payload?: TicketPayload;
  /** Validation tx hash when `validateTicket` was submitted (state `valid`). */
  txHash?: `0x${string}`;
  /** The queued entry when `state === "offline-queued"`. */
  queued?: QueuedValidation;
}

export interface VerifyScannedTicketOptions {
  /** On-chain reads/writes. Omit (or pass `online: false`) for offline mode. */
  chainClient?: ScannerChainClient;
  /** Current time (unix seconds). Defaults to `Date.now()`-derived value. */
  now?: bigint;
  /** Freshness window in seconds. Defaults to the shared default (30s). */
  windowSeconds?: bigint | number;
  /**
   * Whether the scanner is online. When `false` (or when `chainClient` is
   * absent) the pipeline stops after local checks and queues the validation.
   */
  online?: boolean;
  /** Queue to enqueue into when offline. */
  queue?: ValidationQueue;
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/**
 * Parse the JSON envelope produced by the dynamic QR (Task 9) back into a
 * {@link TicketPayload} (string fields → bigint) plus the domain fields needed
 * for verification. Throws when the envelope is malformed.
 */
export function parseEnvelope(envelopeJson: string): {
  payload: TicketPayload;
  signature: `0x${string}`;
  chainId: number;
  verifyingContract: `0x${string}`;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(envelopeJson);
  } catch {
    throw new Error("QR is not valid JSON.");
  }

  const env = raw as Partial<QrEnvelope>;
  if (
    !env ||
    typeof env !== "object" ||
    !env.payload ||
    typeof env.signature !== "string" ||
    typeof env.chainId !== "number" ||
    typeof env.verifyingContract !== "string"
  ) {
    throw new Error("QR envelope is missing required fields.");
  }

  const p = env.payload;
  if (
    typeof p.eventId !== "string" ||
    typeof p.tier !== "string" ||
    typeof p.serial !== "string" ||
    typeof p.owner !== "string" ||
    typeof p.timestamp !== "string" ||
    typeof p.nonce !== "string"
  ) {
    throw new Error("QR payload is missing required fields.");
  }

  const payload: TicketPayload = {
    eventId: BigInt(p.eventId),
    tier: BigInt(p.tier),
    serial: BigInt(p.serial),
    owner: p.owner,
    timestamp: BigInt(p.timestamp),
    nonce: BigInt(p.nonce),
  };

  return {
    payload,
    signature: env.signature,
    chainId: env.chainId,
    verifyingContract: env.verifyingContract,
  };
}

/**
 * The gate verification pipeline (Requirement R10), written as a pure/testable
 * function that the camera component calls with decoded QR text.
 *
 * Order of checks:
 *  1. Parse envelope; malformed → `invalid-signature`.
 *  2. Verify EIP-712 signature against `payload.owner`; false → `invalid-signature`
 *     (NO on-chain calls).
 *  3. Freshness window; stale → `expired` (NO on-chain calls).
 *  4. If offline (or no chain client): queue and return `offline-queued`.
 *  5. Read `isUsed` → `used`; read `ownerOfSerial` != owner → `owner-mismatch`;
 *     otherwise submit `validateTicket` and return `valid`.
 */
export async function verifyScannedTicket(
  envelopeJson: string,
  options: VerifyScannedTicketOptions = {},
): Promise<ScanResult> {
  const {
    chainClient,
    now = nowSeconds(),
    windowSeconds = DEFAULT_TIMESTAMP_WINDOW_SECONDS,
    online = typeof navigator === "undefined" ? true : navigator.onLine,
    queue,
  } = options;

  // 1. Parse.
  let parsed: ReturnType<typeof parseEnvelope>;
  try {
    parsed = parseEnvelope(envelopeJson);
  } catch (error) {
    return {
      state: "invalid-signature",
      message:
        error instanceof Error ? error.message : "Unreadable QR envelope.",
    };
  }

  const { payload, signature, chainId, verifyingContract } = parsed;

  // 2. Signature.
  const signatureValid = await verifyTicketSignature({
    payload,
    signature,
    expectedOwner: payload.owner,
    chainId,
    verifyingContract,
  });
  if (!signatureValid) {
    return {
      state: "invalid-signature",
      message: "Signature does not match the claimed owner.",
      payload,
    };
  }

  // 3. Freshness.
  if (!isTimestampFresh(payload.timestamp, now, windowSeconds)) {
    return {
      state: "expired",
      message: "Ticket QR has expired. Ask the holder to refresh it.",
      payload,
    };
  }

  // 4. Offline: verify locally only and queue.
  const isOnline = online && !!chainClient;
  if (!isOnline) {
    const entry: QueuedValidation = {
      eventId: payload.eventId.toString(),
      tier: payload.tier.toString(),
      serial: payload.serial.toString(),
      owner: payload.owner,
      scannedAt: now.toString(),
    };
    queue?.enqueue(entry);
    return {
      state: "offline-queued",
      message: "Offline: verified locally and queued for validation.",
      payload,
      queued: entry,
    };
  }

  // 5. On-chain checks + validate.
  const used = await chainClient.isUsed(
    payload.eventId,
    payload.tier,
    payload.serial,
  );
  if (used) {
    return {
      state: "used",
      message: "Ticket has already been validated.",
      payload,
    };
  }

  const onChainOwner = await chainClient.ownerOfSerial(
    payload.eventId,
    payload.tier,
    payload.serial,
  );
  if (onChainOwner.toLowerCase() !== payload.owner.toLowerCase()) {
    return {
      state: "owner-mismatch",
      message: "On-chain owner does not match the ticket holder.",
      payload,
    };
  }

  const txHash = await chainClient.validateTicket(
    payload.eventId,
    payload.tier,
    payload.serial,
    payload.owner,
  );
  return {
    state: "valid",
    message: "Valid ticket — entry granted.",
    payload,
    txHash,
  };
}

/**
 * In-memory validation queue for offline mode, with optional persistence to a
 * `Storage` (e.g. `localStorage`) so queued validations survive a reload. Call
 * {@link ValidationQueue.flush} when back online to submit them.
 */
export class ValidationQueue {
  private items: QueuedValidation[] = [];
  private readonly storage?: Storage;
  private readonly storageKey: string;

  constructor(options: { storage?: Storage; storageKey?: string } = {}) {
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? "nftickets:validation-queue";
    this.load();
  }

  private load(): void {
    if (!this.storage) return;
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.items = parsed as QueuedValidation[];
      }
    } catch {
      // Corrupt persisted queue: start fresh rather than crash the scanner.
      this.items = [];
    }
  }

  private persist(): void {
    this.storage?.setItem(this.storageKey, JSON.stringify(this.items));
  }

  /** Add a validation to the queue. */
  enqueue(entry: QueuedValidation): void {
    this.items.push(entry);
    this.persist();
  }

  /** A snapshot of the currently queued validations. */
  list(): QueuedValidation[] {
    return [...this.items];
  }

  /** Number of queued validations. */
  get size(): number {
    return this.items.length;
  }

  /**
   * Submit all queued validations via `chainClient.validateTicket`. Successful
   * entries are removed; failed entries are retained for a future flush.
   * Returns the tx hashes for the entries that succeeded.
   */
  async flush(chainClient: ScannerChainClient): Promise<`0x${string}`[]> {
    const hashes: `0x${string}`[] = [];
    const remaining: QueuedValidation[] = [];

    for (const entry of this.items) {
      try {
        const hash = await chainClient.validateTicket(
          BigInt(entry.eventId),
          BigInt(entry.tier),
          BigInt(entry.serial),
          entry.owner,
        );
        hashes.push(hash);
      } catch {
        remaining.push(entry);
      }
    }

    this.items = remaining;
    this.persist();
    return hashes;
  }
}
