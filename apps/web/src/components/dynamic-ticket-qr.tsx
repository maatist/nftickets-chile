"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  addresses,
  BASE_SEPOLIA_CHAIN_ID,
  buildTicketTypedData,
  type TicketPayload,
} from "@nftickets/shared";
import { getAuthProvider } from "@/providers/auth";
import type { AuthProvider } from "@/providers/auth";
import type { TicketView } from "@/providers/data";

/** How often (ms) the QR payload is regenerated so screenshots expire. */
export const QR_REFRESH_INTERVAL_MS = 25_000;

/**
 * The JSON envelope encoded into the QR. Bigint fields are stringified so the
 * payload is JSON-serializable; the scanner (Task 10) parses them back to
 * `bigint` before verifying with the shared EIP-712 helper.
 */
export interface QrEnvelope {
  payload: {
    eventId: string;
    tier: string;
    serial: string;
    owner: `0x${string}`;
    timestamp: string;
    nonce: string;
  };
  signature: `0x${string}`;
  chainId: number;
  verifyingContract: `0x${string}`;
}

interface QrState {
  status: "idle" | "loading" | "ready" | "error";
  dataUrl?: string;
  timestamp?: bigint;
  message?: string;
}

/** Current unix time in seconds as a bigint. */
function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/** A random uint256-ish nonce so each generation is unique. */
function randomNonce(): bigint {
  const hi = BigInt(Math.floor(Math.random() * 0xffffffff));
  const lo = BigInt(Math.floor(Math.random() * 0xffffffff));
  return (hi << 32n) | lo;
}

export interface DynamicTicketQrProps {
  ticket: TicketView;
  /** Override the AuthProvider (used by tests). Defaults to the app singleton. */
  authProvider?: AuthProvider;
  /** Override the refresh interval (used by tests). */
  refreshIntervalMs?: number;
}

/**
 * Dynamic, time-sensitive ticket QR (Requirement R9.3 / R9.4).
 *
 * Builds a {@link TicketPayload}, signs it via the `AuthProvider` using the
 * shared `buildTicketTypedData` helper (chain = Base Sepolia, verifying
 * contract from shared `addresses`), encodes payload + signature as JSON into a
 * QR data URL with the `qrcode` package, and REGENERATES on a fixed interval so
 * a screenshot of the code stops verifying once its freshness window lapses.
 */
export function DynamicTicketQr({
  ticket,
  authProvider,
  refreshIntervalMs = QR_REFRESH_INTERVAL_MS,
}: DynamicTicketQrProps) {
  const [state, setState] = useState<QrState>({ status: "idle" });
  // A monotonically increasing counter used purely to trigger regeneration.
  const [tick, setTick] = useState(0);
  const generationRef = useRef(0);

  const provider = authProvider ?? getAuthProvider();
  const verifyingContract =
    addresses[BASE_SEPOLIA_CHAIN_ID]?.eventTicketing ??
    ("0x0000000000000000000000000000000000000000" as const);

  const generate = useCallback(async () => {
    const generation = ++generationRef.current;
    setState((prev) => ({ ...prev, status: "loading" }));

    try {
      const owner = await provider.getAddress();
      if (!owner) {
        throw new Error("Log in to display your ticket QR.");
      }

      const timestamp = nowSeconds();
      const payload: TicketPayload = {
        eventId: BigInt(ticket.eventId),
        tier: BigInt(ticket.tier),
        serial: BigInt(ticket.serial),
        owner,
        timestamp,
        nonce: randomNonce(),
      };

      const typedData = buildTicketTypedData(
        payload,
        BASE_SEPOLIA_CHAIN_ID,
        verifyingContract,
      );
      const signature = await provider.signTypedData(typedData);

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
        chainId: BASE_SEPOLIA_CHAIN_ID,
        verifyingContract,
      };

      const dataUrl = await QRCode.toDataURL(JSON.stringify(envelope), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 256,
      });

      // Ignore results from a superseded generation (e.g. rapid re-render).
      if (generation !== generationRef.current) {
        return;
      }
      setState({ status: "ready", dataUrl, timestamp });
    } catch (error: unknown) {
      if (generation !== generationRef.current) {
        return;
      }
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to generate QR.",
      });
    }
  }, [provider, ticket.eventId, ticket.tier, ticket.serial, verifyingContract]);

  // Regenerate whenever `tick` changes (initial mount + each interval).
  useEffect(() => {
    void generate();
  }, [generate, tick]);

  // Fixed-interval regeneration; cleared on unmount so no leaks / stale timers.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, refreshIntervalMs);
    return () => {
      clearInterval(id);
    };
  }, [refreshIntervalMs]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-64 w-64 items-center justify-center rounded-xl border border-neutral-200 bg-white p-2 dark:border-neutral-700">
        {state.status === "ready" && state.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL QR, not a remote asset to optimize
          <img
            src={state.dataUrl}
            alt="Dynamic ticket QR code"
            width={256}
            height={256}
            data-testid="ticket-qr"
            data-timestamp={state.timestamp?.toString()}
            className="h-full w-full"
          />
        ) : state.status === "error" ? (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-red-600">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
            {state.message}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Generating…
          </span>
        )}
      </div>
      <p className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Refreshes every {Math.round(refreshIntervalMs / 1000)}s — screenshots
        expire.
      </p>
    </div>
  );
}
