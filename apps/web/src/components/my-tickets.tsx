"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, LogIn, Loader2 } from "lucide-react";
import { getAuthProvider } from "@/providers/auth";
import { getDataProvider, type TicketView } from "@/providers/data";
import { TicketCard } from "@/components/ticket-card";

type ViewState =
  | { status: "loading" }
  | { status: "logged-out" }
  | { status: "error"; message: string }
  | { status: "ready"; tickets: TicketView[] };

/**
 * "My Tickets" dashboard (Requirement R9.2). Resolves the logged-in address via
 * the `AuthProvider`; when logged out, offers a login action rather than
 * failing. When logged in, lists tickets from the `DataProvider` for that
 * address.
 */
export function MyTickets() {
  const [state, setState] = useState<ViewState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const owner = await getAuthProvider().getAddress();
      if (!owner) {
        setState({ status: "logged-out" });
        return;
      }
      const tickets = await getDataProvider().getMyTickets(owner);
      setState({ status: "ready", tickets });
    } catch (error: unknown) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to load tickets.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLogin = useCallback(async () => {
    await getAuthProvider().login();
    await load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div
        className="flex items-center justify-center gap-2 py-16 text-neutral-500"
        role="status"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>Loading your tickets…</span>
      </div>
    );
  }

  if (state.status === "logged-out") {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-neutral-600 dark:text-neutral-400">
          Log in to view the tickets in your wallet.
        </p>
        <button
          type="button"
          onClick={() => void handleLogin()}
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 font-medium text-brand-fg hover:opacity-90"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Log in
        </button>
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

  if (state.tickets.length === 0) {
    return (
      <p className="py-16 text-center text-neutral-500">
        You don&apos;t own any tickets yet. Browse the feed to grab one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.tickets.map((ticket) => (
        <TicketCard
          key={`${ticket.eventId}-${ticket.tier}-${ticket.serial}`}
          ticket={ticket}
        />
      ))}
    </div>
  );
}
