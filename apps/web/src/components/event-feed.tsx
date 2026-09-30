"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { getDataProvider, type EventView } from "@/providers/data";
import { EventCard } from "@/components/event-card";

type FeedState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; events: EventView[] };

/**
 * Event discovery feed. Loads events from the active `DataProvider`
 * (mock fixtures now, subgraph later) and renders a responsive card grid.
 * Handles loading and error states so the swap to a real data source exercises
 * the same UI paths (Requirement R9.1).
 */
export function EventFeed() {
  const [state, setState] = useState<FeedState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getDataProvider()
      .listEvents()
      .then((events) => {
        if (!cancelled) {
          setState({ status: "ready", events });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Failed to load events.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div
        className="flex items-center justify-center gap-2 py-16 text-neutral-500"
        role="status"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>Loading events…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="flex items-center justify-center gap-2 py-16 text-red-600"
        role="alert"
      >
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
        <span>{state.message}</span>
      </div>
    );
  }

  if (state.events.length === 0) {
    return (
      <p className="py-16 text-center text-neutral-500">
        No events available yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {state.events.map((event) => (
        <EventCard key={event.eventId} event={event} />
      ))}
    </div>
  );
}
