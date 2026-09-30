"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, TicketCheck } from "lucide-react";
import { getDataProvider, type AnalyticsView } from "@/providers/data";
import { formatTokenAmount } from "@/lib/format";

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; analytics: AnalyticsView };

export interface OrganizerAnalyticsProps {
  /** The event to show analytics for (decimal string id). */
  eventId: string;
  /** Human-readable event name for the panel heading. */
  eventName?: string;
  /** Refresh trigger: bump this to re-fetch (e.g. after creating an event). */
  refreshKey?: number;
}

/**
 * Organizer analytics panel (Requirement R11.4). Shows per-event ticket sales
 * counts and entrance validation counts, plus a per-tier breakdown and gross
 * revenue by settlement token, sourced from
 * `DataProvider.getOrganizerAnalytics(eventId)` using the stable
 * {@link AnalyticsView} shape so the mock ↔ subgraph swap is transparent.
 */
export function OrganizerAnalytics({
  eventId,
  eventName,
  refreshKey = 0,
}: OrganizerAnalyticsProps) {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const analytics = await getDataProvider().getOrganizerAnalytics(eventId);
      setState({ status: "ready", analytics });
    } catch (error: unknown) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load analytics.",
      });
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (state.status === "loading") {
    return (
      <div
        className="flex items-center justify-center gap-2 py-12 text-neutral-500"
        role="status"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>Loading analytics…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        className="flex items-center justify-center gap-2 py-12 text-red-600"
        role="alert"
      >
        <AlertCircle className="h-5 w-5" aria-hidden="true" />
        <span>{state.message}</span>
      </div>
    );
  }

  const { analytics } = state;
  const revenueEntries = Object.entries(analytics.revenueByToken);

  return (
    <section
      data-testid="organizer-analytics"
      data-event-id={analytics.eventId}
      className="flex flex-col gap-5 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {eventName ?? `Event ${analytics.eventId}`}
        </h2>
        <span className="text-xs text-neutral-500">Live analytics</span>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-neutral-500">
            <TicketCheck className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Tickets sold
            </span>
          </div>
          <p
            data-testid="analytics-total-sold"
            className="mt-1 text-3xl font-bold tabular-nums"
          >
            {analytics.totalSold.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-neutral-500">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Validated at gate
            </span>
          </div>
          <p
            data-testid="analytics-total-validated"
            className="mt-1 text-3xl font-bold tabular-nums"
          >
            {analytics.totalValidated.toLocaleString()}
          </p>
        </div>
      </div>

      {revenueEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {revenueEntries.map(([symbol, amount]) => (
            <span
              key={symbol}
              className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 font-medium text-brand"
            >
              Gross: {formatTokenAmount(amount, symbol)}
            </span>
          ))}
        </div>
      )}

      {analytics.perTier.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="py-2 font-medium">Tier</th>
              <th className="py-2 text-right font-medium">Sold</th>
              <th className="py-2 text-right font-medium">Validated</th>
            </tr>
          </thead>
          <tbody>
            {analytics.perTier.map((row) => (
              <tr
                key={row.tier}
                data-testid={`analytics-tier-${row.tier}`}
                className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
              >
                <td className="py-2">{row.name}</td>
                <td className="py-2 text-right tabular-nums">
                  {row.sold.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.validated.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
