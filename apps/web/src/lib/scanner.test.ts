import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  BASE_SEPOLIA_CHAIN_ID,
  buildTicketTypedData,
  type TicketPayload,
} from "@nftickets/shared";
import type { QrEnvelope } from "@/components/dynamic-ticket-qr";
import type { ScannerChainClient } from "./chain-client";
import { ValidationQueue, verifyScannedTicket } from "./scanner";

// Two distinct accounts: OWNER signs valid tickets; STRANGER signs invalid ones.
const OWNER = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const STRANGER = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const VERIFYING_CONTRACT =
  "0x00000000000000000000000000000000000000c0" as `0x${string}`;
const CHAIN_ID = BASE_SEPOLIA_CHAIN_ID;
const NOW = 1_700_000_000n;

/** Build a payload owned by `owner` at a given timestamp. */
function makePayload(
  owner: `0x${string}`,
  timestamp = NOW,
): TicketPayload {
  return {
    eventId: 1n,
    tier: 2n,
    serial: 128n,
    owner,
    timestamp,
    nonce: 42n,
  };
}

/**
 * Produce a real EIP-712 signature and serialize it into the QR JSON envelope.
 * `signer` chooses who signs; `claimedOwner` is what the payload claims.
 */
async function makeEnvelopeJson(args: {
  signer: typeof OWNER;
  claimedOwner?: `0x${string}`;
  timestamp?: bigint;
}): Promise<string> {
  const claimedOwner = args.claimedOwner ?? args.signer.address;
  const payload = makePayload(claimedOwner, args.timestamp);
  const typedData = buildTicketTypedData(payload, CHAIN_ID, VERIFYING_CONTRACT);
  const signature = await args.signer.signTypedData(typedData);

  const envelope: QrEnvelope = {
    payload: {
      eventId: payload.eventId.toString(),
      tier: payload.tier.toString(),
      serial: payload.serial.toString(),
      owner: payload.owner,
      timestamp: payload.timestamp.toString(),
      nonce: payload.nonce.toString(),
    },
    signature,
    chainId: CHAIN_ID,
    verifyingContract: VERIFYING_CONTRACT,
  };
  return JSON.stringify(envelope);
}

/** A mock ScannerChainClient with configurable state and spy-able writes. */
function makeChainClient(
  overrides: Partial<{
    used: boolean;
    owner: `0x${string}`;
  }> = {},
): ScannerChainClient & {
  isUsed: ReturnType<typeof vi.fn>;
  ownerOfSerial: ReturnType<typeof vi.fn>;
  validateTicket: ReturnType<typeof vi.fn>;
} {
  const owner = overrides.owner ?? OWNER.address;
  const isUsed = vi.fn(async () => overrides.used ?? false);
  const ownerOfSerial = vi.fn(async () => owner);
  const validateTicket = vi.fn(
    async () => "0xvalidatetxhash" as `0x${string}`,
  );
  return { isUsed, ownerOfSerial, validateTicket };
}

describe("verifyScannedTicket", () => {
  it("returns 'valid' and calls validateTicket for a fresh, unused, owned ticket", async () => {
    const json = await makeEnvelopeJson({ signer: OWNER });
    const chainClient = makeChainClient();

    const res = await verifyScannedTicket(json, {
      chainClient,
      now: NOW,
      online: true,
    });

    expect(res.state).toBe("valid");
    expect(chainClient.isUsed).toHaveBeenCalledTimes(1);
    expect(chainClient.ownerOfSerial).toHaveBeenCalledTimes(1);
    expect(chainClient.validateTicket).toHaveBeenCalledTimes(1);
    expect(chainClient.validateTicket).toHaveBeenCalledWith(
      1n,
      2n,
      128n,
      OWNER.address,
    );
    expect(res.txHash).toBe("0xvalidatetxhash");
  });

  it("returns 'invalid-signature' and makes NO on-chain calls when the signer is not the owner", async () => {
    // STRANGER signs, but the payload claims OWNER as the holder.
    const json = await makeEnvelopeJson({
      signer: STRANGER,
      claimedOwner: OWNER.address,
    });
    const chainClient = makeChainClient();

    const res = await verifyScannedTicket(json, {
      chainClient,
      now: NOW,
      online: true,
    });

    expect(res.state).toBe("invalid-signature");
    expect(chainClient.isUsed).not.toHaveBeenCalled();
    expect(chainClient.ownerOfSerial).not.toHaveBeenCalled();
    expect(chainClient.validateTicket).not.toHaveBeenCalled();
  });

  it("returns 'invalid-signature' for a malformed envelope", async () => {
    const chainClient = makeChainClient();
    const res = await verifyScannedTicket("not-json", {
      chainClient,
      now: NOW,
      online: true,
    });
    expect(res.state).toBe("invalid-signature");
    expect(chainClient.isUsed).not.toHaveBeenCalled();
  });

  it("returns 'expired' and makes NO on-chain calls for a stale timestamp", async () => {
    // Signed at NOW but scanned far beyond the freshness window.
    const json = await makeEnvelopeJson({ signer: OWNER, timestamp: NOW });
    const chainClient = makeChainClient();

    const res = await verifyScannedTicket(json, {
      chainClient,
      now: NOW + 10_000n,
      online: true,
    });

    expect(res.state).toBe("expired");
    expect(chainClient.isUsed).not.toHaveBeenCalled();
    expect(chainClient.validateTicket).not.toHaveBeenCalled();
  });

  it("returns 'used' and does NOT re-validate when the chain reports isUsed=true (double-validation blocked)", async () => {
    const json = await makeEnvelopeJson({ signer: OWNER });
    const chainClient = makeChainClient({ used: true });

    const res = await verifyScannedTicket(json, {
      chainClient,
      now: NOW,
      online: true,
    });

    expect(res.state).toBe("used");
    expect(chainClient.isUsed).toHaveBeenCalledTimes(1);
    expect(chainClient.validateTicket).not.toHaveBeenCalled();
  });

  it("returns 'owner-mismatch' when the on-chain serial owner differs from the holder", async () => {
    const json = await makeEnvelopeJson({ signer: OWNER });
    const chainClient = makeChainClient({ owner: STRANGER.address });

    const res = await verifyScannedTicket(json, {
      chainClient,
      now: NOW,
      online: true,
    });

    expect(res.state).toBe("owner-mismatch");
    expect(chainClient.validateTicket).not.toHaveBeenCalled();
  });

  it("verifies locally and enqueues when offline (no on-chain calls)", async () => {
    const json = await makeEnvelopeJson({ signer: OWNER });
    const chainClient = makeChainClient();
    const queue = new ValidationQueue();

    const res = await verifyScannedTicket(json, {
      chainClient,
      now: NOW,
      online: false,
      queue,
    });

    expect(res.state).toBe("offline-queued");
    expect(chainClient.isUsed).not.toHaveBeenCalled();
    expect(chainClient.validateTicket).not.toHaveBeenCalled();
    expect(queue.size).toBe(1);
    expect(queue.list()[0]).toMatchObject({
      eventId: "1",
      tier: "2",
      serial: "128",
      owner: OWNER.address,
    });
  });

  it("does NOT queue an offline scan whose signature is invalid", async () => {
    const json = await makeEnvelopeJson({
      signer: STRANGER,
      claimedOwner: OWNER.address,
    });
    const queue = new ValidationQueue();

    const res = await verifyScannedTicket(json, {
      now: NOW,
      online: false,
      queue,
    });

    expect(res.state).toBe("invalid-signature");
    expect(queue.size).toBe(0);
  });
});

describe("ValidationQueue.flush", () => {
  it("submits queued validations when back online and clears them", async () => {
    const json = await makeEnvelopeJson({ signer: OWNER });
    const chainClient = makeChainClient();
    const queue = new ValidationQueue();

    // Scan while offline -> queued.
    await verifyScannedTicket(json, { now: NOW, online: false, queue });
    expect(queue.size).toBe(1);

    // Back online: flush submits via validateTicket.
    const hashes = await queue.flush(chainClient);

    expect(chainClient.validateTicket).toHaveBeenCalledTimes(1);
    expect(chainClient.validateTicket).toHaveBeenCalledWith(
      1n,
      2n,
      128n,
      OWNER.address,
    );
    expect(hashes).toEqual(["0xvalidatetxhash"]);
    expect(queue.size).toBe(0);
  });

  it("retains entries whose submission fails", async () => {
    const json = await makeEnvelopeJson({ signer: OWNER });
    const queue = new ValidationQueue();
    await verifyScannedTicket(json, { now: NOW, online: false, queue });

    const failing = makeChainClient();
    failing.validateTicket.mockRejectedValueOnce(new Error("rpc down"));

    const hashes = await queue.flush(failing);

    expect(hashes).toEqual([]);
    expect(queue.size).toBe(1);
  });
});

describe("ValidationQueue persistence", () => {
  let store: Record<string, string>;
  let storage: Storage;

  beforeEach(() => {
    store = {};
    storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    } as Storage;
  });

  it("persists queued validations and reloads them", async () => {
    const json = await makeEnvelopeJson({ signer: OWNER });
    const queue = new ValidationQueue({ storage });
    await verifyScannedTicket(json, { now: NOW, online: false, queue });
    expect(queue.size).toBe(1);

    // A fresh queue backed by the same storage rehydrates the entry.
    const reloaded = new ValidationQueue({ storage });
    expect(reloaded.size).toBe(1);
    expect(reloaded.list()[0]).toMatchObject({ eventId: "1", serial: "128" });
  });
});
