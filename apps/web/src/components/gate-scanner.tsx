"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  CameraOff,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  UserX,
  WifiOff,
  XCircle,
} from "lucide-react";
import { getAuthProvider } from "@/providers/auth";
import {
  ValidationQueue,
  verifyScannedTicket,
  type ScanResult,
  type ScanState,
} from "@/lib/scanner";
import { ViemScannerChainClient } from "@/lib/chain-client";
import type { ScannerChainClient } from "@/lib/chain-client";

export interface GateScannerProps {
  /** Inject a chain client (tests / SSR); defaults to the viem-backed impl. */
  chainClient?: ScannerChainClient;
  /** Inject a validation queue (tests); defaults to a localStorage-backed one. */
  queue?: ValidationQueue;
  /** Disable the camera (tests / non-browser); the pipeline is still testable. */
  enableCamera?: boolean;
}

const STATE_STYLES: Record<
  ScanState,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  valid: {
    label: "Valid",
    className: "bg-green-50 text-green-800 border-green-300",
    Icon: CheckCircle2,
  },
  used: {
    label: "Already used",
    className: "bg-amber-50 text-amber-800 border-amber-300",
    Icon: ShieldAlert,
  },
  "invalid-signature": {
    label: "Invalid signature",
    className: "bg-red-50 text-red-800 border-red-300",
    Icon: XCircle,
  },
  expired: {
    label: "Expired",
    className: "bg-orange-50 text-orange-800 border-orange-300",
    Icon: Clock,
  },
  "owner-mismatch": {
    label: "Owner mismatch",
    className: "bg-red-50 text-red-800 border-red-300",
    Icon: UserX,
  },
  "offline-queued": {
    label: "Queued (offline)",
    className: "bg-sky-50 text-sky-800 border-sky-300",
    Icon: WifiOff,
  },
};

/**
 * Gate scanner (Gatekeeper) view — Requirement R10.
 *
 * Reads a QR via the device camera (@zxing/browser), then hands the decoded
 * text to the pure {@link verifyScannedTicket} pipeline, which verifies the
 * EIP-712 signature and freshness off-chain and, when online, checks
 * `isUsed`/`ownerOfSerial` and fires `validateTicket`. When offline it verifies
 * locally and queues the validation, flushing the queue when back online.
 *
 * The camera is a thin shell; all verification logic lives in `lib/scanner.ts`
 * so it is unit-testable without a camera.
 */
export function GateScanner({
  chainClient,
  queue,
  enableCamera = true,
}: GateScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanningRef = useRef(false);

  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queueSize, setQueueSize] = useState(0);

  const client = useMemo<ScannerChainClient>(
    () =>
      chainClient ??
      new ViemScannerChainClient({ authProvider: getAuthProvider() }),
    [chainClient],
  );
  const validationQueue = useMemo(
    () => queue ?? new ValidationQueue({ storage: safeLocalStorage() }),
    [queue],
  );

  useEffect(() => {
    setQueueSize(validationQueue.size);
  }, [validationQueue]);

  /** Verify a single decoded QR string through the pipeline. */
  const handleDecoded = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        const res = await verifyScannedTicket(text, {
          chainClient: client,
          online,
          queue: validationQueue,
        });
        setResult(res);
        setQueueSize(validationQueue.size);
      } finally {
        setBusy(false);
      }
    },
    [client, online, validationQueue],
  );

  /** Flush queued validations once back online. */
  const flushQueue = useCallback(async () => {
    setBusy(true);
    try {
      await validationQueue.flush(client);
      setQueueSize(validationQueue.size);
    } finally {
      setBusy(false);
    }
  }, [client, validationQueue]);

  // Track connectivity so offline mode + queue flushing kick in automatically.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const goOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flushQueue]);

  // Start the camera reader; decode continuously.
  useEffect(() => {
    if (!enableCamera || typeof navigator === "undefined") return;
    if (scanningRef.current) return;
    scanningRef.current = true;

    const reader = new BrowserQRCodeReader();
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (res) => {
        if (cancelled || !res) return;
        void handleDecoded(res.getText());
      })
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((err: unknown) => {
        setCameraError(
          err instanceof Error ? err.message : "Unable to access the camera.",
        );
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      scanningRef.current = false;
    };
  }, [enableCamera, handleDecoded]);

  const style = result ? STATE_STYLES[result.state] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
            online
              ? "bg-green-100 text-green-800"
              : "bg-neutral-200 text-neutral-700"
          }`}
        >
          {online ? "Online" : <WifiOff className="h-3.5 w-3.5" />}
          {online ? "" : "Offline"}
        </span>
        {queueSize > 0 && (
          <button
            type="button"
            onClick={() => void flushQueue()}
            disabled={!online || busy}
            className="rounded-md bg-brand px-3 py-1.5 font-medium text-brand-fg disabled:opacity-50"
          >
            Flush queue ({queueSize})
          </button>
        )}
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-neutral-300 bg-black dark:border-neutral-700">
        {enableCamera && !cameraError ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- live camera stream, no captions
          <video
            ref={videoRef}
            data-testid="scanner-video"
            className="h-full w-full object-cover"
            muted
            playsInline
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-neutral-400">
            <CameraOff className="h-8 w-8" aria-hidden="true" />
            {cameraError ?? "Camera preview unavailable."}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>

      {result && style && (
        <div
          role="status"
          data-testid="scan-result"
          data-state={result.state}
          className={`flex items-start gap-3 rounded-xl border p-4 ${style.className}`}
        >
          <style.Icon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{style.label}</p>
            <p className="text-sm opacity-90">{result.message}</p>
            {result.payload && (
              <p className="mt-1 text-xs opacity-75">
                Event {result.payload.eventId.toString()} · Tier{" "}
                {result.payload.tier.toString()} · Serial{" "}
                {result.payload.serial.toString()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** localStorage if available (browser), else undefined (SSR / tests). */
function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}
