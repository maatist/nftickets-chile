"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, MapPin, QrCode } from "lucide-react";
import type { TicketView } from "@/providers/data";
import { formatEventDate } from "@/lib/format";
import { DynamicTicketQr } from "@/components/dynamic-ticket-qr";

/**
 * A single owned ticket. Shows event details and, on demand, opens the dynamic
 * QR for gate entry. Used tickets are visually marked and do not offer a QR.
 */
export function TicketCard({ ticket }: { ticket: TicketView }) {
  const [showQr, setShowQr] = useState(false);

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row">
      <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800 sm:w-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ticket.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold leading-tight">
            {ticket.eventName}
          </h2>
          <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
            {ticket.tierName}
          </span>
        </div>

        <dl className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            <dd>{formatEventDate(ticket.startsAt)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <dd>{ticket.location}</dd>
          </div>
          <div className="text-xs text-neutral-400">
            Serial #{ticket.serial}
          </div>
        </dl>

        <div className="mt-1">
          {ticket.used ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Already used
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowQr((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90"
              aria-expanded={showQr}
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              {showQr ? "Hide QR" : "Show entry QR"}
            </button>
          )}
        </div>

        {showQr && !ticket.used ? (
          <div className="mt-3 flex justify-center">
            <DynamicTicketQr ticket={ticket} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
