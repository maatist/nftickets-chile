"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, Plus } from "lucide-react";
import { getAuthProvider } from "@/providers/auth";
import { getDataProvider, type EventView } from "@/providers/data";
import { EventCreationModal } from "@/components/event-creation-modal";
import { OrganizerAnalytics } from "@/components/organizer-analytics";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; events: EventView[]; organizer: `0x${string}` | null };

/**
 * Organizer dashboard (Requirement R11). Lists the logged-in organizer's events
 * with a live analytics panel per event, and opens the {@link EventCreationModal}
 * to create a new one. After a create, analytics re-fetch via a bumped refresh
 * key so the dashboard reflects the change.
 */
export function OrganizerDashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const organizer = await getAuthProvider().getAddress();
      const all = await getDataProvider().listEvents();
      // Show the organizer's own events first; fall back to all when logged out
      // so the dashboard is explorable in the mock without logging in.
      const mine = organizer
        ? all.filter(
            (e) => e.organizer.toLowerCase() === organizer.toLowerCase(),
          )
        : all;
      setState({
        status: "ready",
        events: mine.length > 0 ? mine : all,
        organizer,
      });
    } catch (error: unknown) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to load dashboard.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = useCallback(() => {
    setModalOpen(false);
    setRefreshKey((k) => k + 1);
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Create events and watch sales and gate validations update live.
        </p>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New event
        </button>
      </div>

      {state.status === "loading" && (
        <div
          className="flex items-center justify-center gap-2 py-16 text-neutral-500"
          role="status"
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading your events…</span>
        </div>
      )}

      {state.status === "error" && (
        <div
          className="flex items-center justify-center gap-2 py-16 text-red-600"
          role="alert"
        >
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      )}

      {state.status === "ready" && state.events.length === 0 && (
        <p className="py-16 text-center text-neutral-500">
          No events yet. Create your first event to get started.
        </p>
      )}

      {state.status === "ready" && (
        <div className="flex flex-col gap-5">
          {state.events.map((event) => (
            <OrganizerAnalytics
              key={event.eventId}
              eventId={event.eventId}
              eventName={event.name}
              refreshKey={refreshKey}
            />
          ))}
        </div>
      )}

      <EventCreationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
