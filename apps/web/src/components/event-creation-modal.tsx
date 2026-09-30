"use client";

import { useCallback, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ZERO_ADDRESS } from "@nftickets/shared";
import { getAuthProvider } from "@/providers/auth";
import type { AuthProvider } from "@/providers/auth";
import { getStorageProvider } from "@/providers/storage";
import type { StorageProvider } from "@/providers/storage";
import {
  submitEventCreation,
  type OrganizerEventForm,
  type OrganizerTierForm,
  type SubmitEventCreationResult,
} from "@/lib/organizer";

/** Editable tier row in the form; prices are entered as smallest-unit strings. */
type TierDraft = OrganizerTierForm;

function emptyTier(index: number): TierDraft {
  return {
    tier: String(index),
    name: "",
    maxSupply: 100,
    price: "0",
    maxResalePrice: "0",
    payToken: ZERO_ADDRESS,
    payTokenSymbol: "ETH",
  };
}

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; result: SubmitEventCreationResult }
  | { status: "error"; message: string };

export interface EventCreationModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the created event id after a successful submit. */
  onCreated?: (eventId: string) => void;
  /** Inject an AuthProvider (tests); defaults to the app singleton. */
  authProvider?: AuthProvider;
  /** Inject a StorageProvider (tests); defaults to the app singleton. */
  storageProvider?: StorageProvider;
}

/**
 * Event creation modal (Requirement R11.1 / R11.2). Collects event fields
 * (eventId, name, description, location, start, cover image) and one or more
 * tiers (tier id, name, supply, price, resale cap, pay token). On submit it
 * delegates to the pure {@link submitEventCreation} orchestrator, which uploads
 * the image + metadata via the `StorageProvider` and submits `createEvent` +
 * `addTier` via the `AuthProvider`. Loading/success/error states are surfaced
 * inline so the flow works identically once real services are connected.
 */
export function EventCreationModal({
  open,
  onClose,
  onCreated,
  authProvider,
  storageProvider,
}: EventCreationModalProps) {
  const [eventId, setEventId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [tiers, setTiers] = useState<TierDraft[]>([emptyTier(0)]);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  const updateTier = useCallback(
    (index: number, patch: Partial<TierDraft>) => {
      setTiers((prev) =>
        prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
      );
    },
    [],
  );

  const addTierRow = useCallback(() => {
    setTiers((prev) => [...prev, emptyTier(prev.length)]);
  }, []);

  const removeTierRow = useCallback((index: number) => {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setSubmit({ status: "submitting" });

      const form: OrganizerEventForm = {
        eventId: eventId.trim(),
        name: name.trim(),
        description: description.trim(),
        location: location.trim(),
        startsAt,
        image,
        tiers,
      };

      try {
        const result = await submitEventCreation({
          form,
          storage: storageProvider ?? getStorageProvider(),
          auth: authProvider ?? getAuthProvider(),
        });
        setSubmit({ status: "success", result });
        onCreated?.(form.eventId);
      } catch (error: unknown) {
        setSubmit({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create the event.",
        });
      }
    },
    [
      authProvider,
      description,
      eventId,
      image,
      location,
      name,
      onCreated,
      startsAt,
      storageProvider,
      tiers,
    ],
  );

  if (!open) {
    return null;
  }

  const submitting = submit.status === "submitting";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create event"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-neutral-950 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Create event</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Event id</span>
              <input
                type="text"
                inputMode="numeric"
                required
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                placeholder="42"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                placeholder="Fauna Primavera 2026"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="Two days of live acts across four stages."
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Location</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                placeholder="Espacio Broadway, Santiago"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Starts at</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Cover image</span>
            <input
              type="file"
              accept="image/*"
              aria-label="Cover image"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className="text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:text-neutral-400 dark:file:bg-neutral-800"
            />
          </label>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">Tiers</legend>
            {tiers.map((tier, index) => (
              <div
                key={index}
                data-testid={`tier-row-${index}`}
                className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">
                    Tier {tier.tier}
                  </span>
                  {tiers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTierRow(index)}
                      className="rounded p-1 text-neutral-400 hover:text-red-600"
                      aria-label={`Remove tier ${tier.tier}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span>Tier index</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tier.tier}
                      aria-label={`Tier ${index} index`}
                      onChange={(e) =>
                        updateTier(index, { tier: e.target.value })
                      }
                      className="rounded-md border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>Name</span>
                    <input
                      type="text"
                      value={tier.name}
                      aria-label={`Tier ${index} name`}
                      onChange={(e) =>
                        updateTier(index, { name: e.target.value })
                      }
                      className="rounded-md border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>Max supply</span>
                    <input
                      type="number"
                      min={1}
                      value={tier.maxSupply}
                      aria-label={`Tier ${index} max supply`}
                      onChange={(e) =>
                        updateTier(index, {
                          maxSupply: Number(e.target.value),
                        })
                      }
                      className="rounded-md border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>Pay token</span>
                    <select
                      value={tier.payTokenSymbol}
                      aria-label={`Tier ${index} pay token`}
                      onChange={(e) => {
                        const symbol = e.target.value;
                        updateTier(index, {
                          payTokenSymbol: symbol,
                          payToken:
                            symbol === "ETH"
                              ? ZERO_ADDRESS
                              : ("0x036cbd53842c5426634e7929541ec2318f3dcf7e" as `0x${string}`),
                        });
                      }}
                      className="rounded-md border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="ETH">ETH (native)</option>
                      <option value="USDC">USDC</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>Price (base units)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tier.price}
                      aria-label={`Tier ${index} price`}
                      onChange={(e) =>
                        updateTier(index, { price: e.target.value })
                      }
                      className="rounded-md border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>Resale cap (base units)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tier.maxResalePrice}
                      aria-label={`Tier ${index} resale cap`}
                      onChange={(e) =>
                        updateTier(index, { maxResalePrice: e.target.value })
                      }
                      className="rounded-md border border-neutral-300 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addTierRow}
              className="inline-flex items-center gap-1.5 self-start rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add tier
            </button>
          </fieldset>

          {submit.status === "error" && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {submit.message}
            </p>
          )}
          {submit.status === "success" && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Event created. Metadata pinned at {submit.result.metadataUri}.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
            >
              {submitting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {submitting ? "Creating…" : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
