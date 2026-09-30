import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData } from "viem";
import { eventTicketingAbi, ZERO_ADDRESS } from "@nftickets/shared";
import type { AuthProvider, TxRequest } from "@/providers/auth";
import type { EventMetadata, StorageProvider } from "@/providers/storage";
import { EventCreationModal } from "./event-creation-modal";

function makeStorage(): StorageProvider & {
  uploadImage: ReturnType<typeof vi.fn>;
  uploadMetadata: ReturnType<typeof vi.fn>;
} {
  return {
    uploadImage: vi.fn(async () => "ipfs://image-cid"),
    uploadMetadata: vi.fn(
      async (_meta: EventMetadata) => "ipfs://metadata-cid",
    ),
  };
}

function makeAuth(): AuthProvider & {
  sendSponsoredTx: ReturnType<typeof vi.fn>;
} {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    getAddress: vi.fn(async () => null),
    signTypedData: vi.fn(),
    sendSponsoredTx: vi.fn(
      async (_tx: TxRequest) => "0xhash" as `0x${string}`,
    ),
  };
}

describe("EventCreationModal", () => {
  it("submits the form: uploads via storage and sends createEvent + addTier via auth", async () => {
    const storage = makeStorage();
    const auth = makeAuth();
    const onCreated = vi.fn();

    render(
      <EventCreationModal
        open
        onClose={vi.fn()}
        onCreated={onCreated}
        storageProvider={storage}
        authProvider={auth}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("42"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByPlaceholderText("Fauna Primavera 2026"), {
      target: { value: "My Event" },
    });

    // Fill the single default tier row.
    fireEvent.change(screen.getByLabelText("Tier 0 name"), {
      target: { value: "General" },
    });
    fireEvent.change(screen.getByLabelText("Tier 0 price"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("Tier 0 resale cap"), {
      target: { value: "1200" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => {
      expect(auth.sendSponsoredTx).toHaveBeenCalledTimes(2);
    });

    // Storage was exercised for metadata (no image selected here).
    expect(storage.uploadMetadata).toHaveBeenCalledTimes(1);

    const sent = auth.sendSponsoredTx.mock.calls.map(
      (c) => c[0] as TxRequest,
    );
    const createCall = decodeFunctionData({
      abi: eventTicketingAbi,
      data: sent[0]!.data!,
    });
    expect(createCall.functionName).toBe("createEvent");
    expect(createCall.args).toEqual([7n]);

    const tierCall = decodeFunctionData({
      abi: eventTicketingAbi,
      data: sent[1]!.data!,
    });
    expect(tierCall.functionName).toBe("addTier");
    expect(tierCall.args).toEqual([
      7n,
      0n,
      100n, // default max supply
      1000n,
      1200n,
      ZERO_ADDRESS,
    ]);

    expect(onCreated).toHaveBeenCalledWith("7");
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/event created/i);
    });
  });

  it("shows an error and sends no tx when the resale cap is below price", async () => {
    const storage = makeStorage();
    const auth = makeAuth();

    render(
      <EventCreationModal
        open
        onClose={vi.fn()}
        storageProvider={storage}
        authProvider={auth}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("42"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByPlaceholderText("Fauna Primavera 2026"), {
      target: { value: "My Event" },
    });
    fireEvent.change(screen.getByLabelText("Tier 0 name"), {
      target: { value: "General" },
    });
    fireEvent.change(screen.getByLabelText("Tier 0 price"), {
      target: { value: "2000" },
    });
    fireEvent.change(screen.getByLabelText("Tier 0 resale cap"), {
      target: { value: "1000" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/resale cap/i);
    });
    expect(auth.sendSponsoredTx).not.toHaveBeenCalled();
  });
});
