import { render, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { TypedDataDefinition } from "viem";
import type { AuthProvider } from "@/providers/auth";
import type { TicketView } from "@/providers/data";

// Mock the qrcode package: return a unique data URL per call so we can detect
// regeneration by watching the rendered image src change.
let qrCallCount = 0;
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async () => {
      qrCallCount += 1;
      return `data:image/png;base64,QR_${qrCallCount}`;
    }),
  },
}));

import { DynamicTicketQr } from "./dynamic-ticket-qr";

const TICKET: TicketView = {
  eventId: "1",
  eventName: "Test Event",
  imageUrl: "https://example.com/x.png",
  location: "Venue",
  startsAt: "2025-11-14T18:00:00-03:00",
  tier: "1",
  tierName: "VIP",
  serial: "128",
  owner: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  used: false,
};

/** Build a stub AuthProvider whose signTypedData returns a fresh signature. */
function makeAuthStub(): {
  provider: AuthProvider;
  signTypedData: ReturnType<typeof vi.fn>;
} {
  let sigCount = 0;
  const signTypedData = vi.fn(async (_data: TypedDataDefinition) => {
    sigCount += 1;
    return `0x${sigCount.toString(16).padStart(130, "0")}` as `0x${string}`;
  });
  const provider: AuthProvider = {
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    getAddress: vi.fn(async () => TICKET.owner),
    signTypedData,
    sendSponsoredTx: vi.fn(async () => "0x" as `0x${string}`),
  };
  return { provider, signTypedData };
}

beforeEach(() => {
  qrCallCount = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("DynamicTicketQr", () => {
  it("signs the ticket payload and renders a QR on mount", async () => {
    const { provider, signTypedData } = makeAuthStub();

    render(<DynamicTicketQr ticket={TICKET} authProvider={provider} />);

    await vi.waitFor(() => {
      expect(screen.getByTestId("ticket-qr")).toBeInTheDocument();
    });

    expect(signTypedData).toHaveBeenCalledTimes(1);
    // The signed typed data must target the ticket's fields.
    const typedData = signTypedData.mock.calls[0]![0] as TypedDataDefinition;
    expect(typedData.primaryType).toBe("Ticket");
  });

  it("regenerates the QR payload on the fixed interval", async () => {
    const { provider, signTypedData } = makeAuthStub();
    const intervalMs = 25_000;

    render(
      <DynamicTicketQr
        ticket={TICKET}
        authProvider={provider}
        refreshIntervalMs={intervalMs}
      />,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId("ticket-qr")).toBeInTheDocument();
    });
    expect(signTypedData).toHaveBeenCalledTimes(1);
    const firstSrc = screen.getByTestId("ticket-qr").getAttribute("src");

    // Advance one interval — a new payload must be signed and re-encoded.
    await vi.advanceTimersByTimeAsync(intervalMs);

    await vi.waitFor(() => {
      expect(signTypedData).toHaveBeenCalledTimes(2);
      // The QR re-renders (out of the transient loading state) with a new src.
      const src = screen.getByTestId("ticket-qr").getAttribute("src");
      expect(src).not.toBe(firstSrc);
    });

    // A second interval regenerates again.
    await vi.advanceTimersByTimeAsync(intervalMs);
    await vi.waitFor(() => {
      expect(signTypedData).toHaveBeenCalledTimes(3);
    });
  });

  it("shows a login prompt when no address is available", async () => {
    const { provider } = makeAuthStub();
    (provider.getAddress as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    render(<DynamicTicketQr ticket={TICKET} authProvider={provider} />);

    await vi.waitFor(() => {
      expect(screen.getByText(/log in to display/i)).toBeInTheDocument();
    });
  });
});
