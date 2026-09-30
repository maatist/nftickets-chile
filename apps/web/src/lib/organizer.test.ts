import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData } from "viem";
import { eventTicketingAbi, ZERO_ADDRESS } from "@nftickets/shared";
import type { AuthProvider, TxRequest } from "@/providers/auth";
import type { EventMetadata, StorageProvider } from "@/providers/storage";
import {
  buildCreateEventCalls,
  submitEventCreation,
  validateEventForm,
  type OrganizerEventForm,
} from "./organizer";

const CONTRACT =
  "0x00000000000000000000000000000000000000c0" as `0x${string}`;
const USDC =
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as `0x${string}`;

function makeForm(
  overrides: Partial<OrganizerEventForm> = {},
): OrganizerEventForm {
  return {
    eventId: "42",
    name: "Fauna Primavera 2026",
    description: "Two days of live acts.",
    location: "Espacio Broadway, Santiago",
    startsAt: "2026-11-14T18:00",
    image: new Blob(["binary-image-bytes"], { type: "image/png" }),
    tiers: [
      {
        tier: "0",
        name: "General",
        maxSupply: 5000,
        price: "45000000000000000",
        maxResalePrice: "54000000000000000",
        payToken: ZERO_ADDRESS,
        payTokenSymbol: "ETH",
      },
      {
        tier: "1",
        name: "VIP",
        maxSupply: 500,
        price: "120000000000000000",
        maxResalePrice: "150000000000000000",
        payToken: USDC,
        payTokenSymbol: "USDC",
      },
    ],
    ...overrides,
  };
}

/** A spy StorageProvider returning deterministic URIs. */
function makeStorage(): StorageProvider & {
  uploadImage: ReturnType<typeof vi.fn>;
  uploadMetadata: ReturnType<typeof vi.fn>;
} {
  const uploadImage = vi.fn(async (_file: Blob) => "ipfs://image-cid");
  const uploadMetadata = vi.fn(
    async (_meta: EventMetadata) => "ipfs://metadata-cid",
  );
  return { uploadImage, uploadMetadata };
}

/** A spy AuthProvider capturing sendSponsoredTx calls. */
function makeAuth(): AuthProvider & {
  sendSponsoredTx: ReturnType<typeof vi.fn>;
} {
  let counter = 0;
  const sendSponsoredTx = vi.fn(async (_tx: TxRequest) => {
    counter += 1;
    return `0x${counter.toString(16).padStart(64, "0")}` as `0x${string}`;
  });
  return {
    login: vi.fn(),
    logout: vi.fn(),
    getAddress: vi.fn(async () => null),
    signTypedData: vi.fn(),
    sendSponsoredTx,
  };
}

describe("buildCreateEventCalls", () => {
  it("encodes createEvent first, then one addTier per tier with correct args", () => {
    const calls = buildCreateEventCalls(makeForm(), CONTRACT);

    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.to === CONTRACT)).toBe(true);

    // createEvent(42)
    const decodedCreate = decodeFunctionData({
      abi: eventTicketingAbi,
      data: calls[0]!.data,
    });
    expect(decodedCreate.functionName).toBe("createEvent");
    expect(decodedCreate.args).toEqual([42n]);

    // addTier(42, 0, 5000, 45e15, 54e15, ZERO_ADDRESS)
    const decodedTier0 = decodeFunctionData({
      abi: eventTicketingAbi,
      data: calls[1]!.data,
    });
    expect(decodedTier0.functionName).toBe("addTier");
    expect(decodedTier0.args).toEqual([
      42n,
      0n,
      5000n,
      45000000000000000n,
      54000000000000000n,
      ZERO_ADDRESS,
    ]);

    // addTier(42, 1, 500, 12e16, 15e16, USDC)
    const decodedTier1 = decodeFunctionData({
      abi: eventTicketingAbi,
      data: calls[2]!.data,
    });
    expect(decodedTier1.functionName).toBe("addTier");
    const tier1Args = decodedTier1.args as readonly unknown[];
    expect(tier1Args.slice(0, 5)).toEqual([
      42n,
      1n,
      500n,
      120000000000000000n,
      150000000000000000n,
    ]);
    // viem returns a checksummed address from decode; compare case-insensitively.
    expect((tier1Args[5] as string).toLowerCase()).toBe(USDC.toLowerCase());
  });
});

describe("validateEventForm", () => {
  it("rejects a resale cap below the price", () => {
    const form = makeForm({
      tiers: [
        {
          tier: "0",
          name: "General",
          maxSupply: 100,
          price: "1000",
          maxResalePrice: "900",
          payToken: ZERO_ADDRESS,
          payTokenSymbol: "ETH",
        },
      ],
    });
    expect(() => validateEventForm(form)).toThrow(/resale cap/i);
  });

  it("rejects a zero supply", () => {
    const form = makeForm({
      tiers: [
        {
          tier: "0",
          name: "General",
          maxSupply: 0,
          price: "1000",
          maxResalePrice: "1000",
          payToken: ZERO_ADDRESS,
          payTokenSymbol: "ETH",
        },
      ],
    });
    expect(() => validateEventForm(form)).toThrow(/supply/i);
  });

  it("rejects a form with no tiers", () => {
    expect(() => validateEventForm(makeForm({ tiers: [] }))).toThrow(
      /at least one/i,
    );
  });
});

describe("submitEventCreation", () => {
  it("uploads image + metadata and submits createEvent + addTier with correct calldata", async () => {
    const storage = makeStorage();
    const auth = makeAuth();
    const form = makeForm();

    const result = await submitEventCreation({
      form,
      storage,
      auth,
      contractAddress: CONTRACT,
    });

    // Storage: image first, then metadata referencing the image URI.
    expect(storage.uploadImage).toHaveBeenCalledTimes(1);
    expect(storage.uploadImage).toHaveBeenCalledWith(form.image);
    expect(storage.uploadMetadata).toHaveBeenCalledTimes(1);
    const meta = storage.uploadMetadata.mock.calls[0]![0] as EventMetadata;
    expect(meta.eventId).toBe("42");
    expect(meta.image).toBe("ipfs://image-cid");
    expect(meta.tiers).toHaveLength(2);

    // Auth: one createEvent + two addTier calls, in order.
    expect(auth.sendSponsoredTx).toHaveBeenCalledTimes(3);
    const sent = auth.sendSponsoredTx.mock.calls.map(
      (c) => c[0] as TxRequest,
    );
    expect(sent.every((tx) => tx.to === CONTRACT)).toBe(true);

    const decoded = sent.map((tx) =>
      decodeFunctionData({ abi: eventTicketingAbi, data: tx.data! }),
    );
    expect(decoded[0]!.functionName).toBe("createEvent");
    expect(decoded[0]!.args).toEqual([42n]);
    expect(decoded[1]!.functionName).toBe("addTier");
    expect(decoded[1]!.args).toEqual([
      42n,
      0n,
      5000n,
      45000000000000000n,
      54000000000000000n,
      ZERO_ADDRESS,
    ]);
    expect(decoded[2]!.functionName).toBe("addTier");
    expect((decoded[2]!.args as readonly unknown[])[1]).toBe(1n);

    // Result surfaces URIs + tx hashes.
    expect(result.imageUri).toBe("ipfs://image-cid");
    expect(result.metadataUri).toBe("ipfs://metadata-cid");
    expect(result.tierTxHashes).toHaveLength(2);
  });

  it("skips uploadImage when no image is provided but still uploads metadata", async () => {
    const storage = makeStorage();
    const auth = makeAuth();
    const form = makeForm({ image: null });

    const result = await submitEventCreation({
      form,
      storage,
      auth,
      contractAddress: CONTRACT,
    });

    expect(storage.uploadImage).not.toHaveBeenCalled();
    expect(storage.uploadMetadata).toHaveBeenCalledTimes(1);
    expect(result.imageUri).toBe("");
  });

  it("does not submit any tx when the form is invalid", async () => {
    const storage = makeStorage();
    const auth = makeAuth();
    const form = makeForm({ eventId: "not-a-number" });

    await expect(
      submitEventCreation({ form, storage, auth, contractAddress: CONTRACT }),
    ).rejects.toThrow(/event id/i);

    expect(storage.uploadImage).not.toHaveBeenCalled();
    expect(auth.sendSponsoredTx).not.toHaveBeenCalled();
  });
});
