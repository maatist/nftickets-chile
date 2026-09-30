import { CalendarDays, MapPin, Ticket } from "lucide-react";
import type { EventView } from "@/providers/data";
import { formatEventDate, formatTokenAmount } from "@/lib/format";

/** Lowest tier price shown as a "from" label on the card. */
function lowestPrice(event: EventView): string | null {
  if (event.tiers.length === 0) {
    return null;
  }
  const cheapest = event.tiers.reduce((min, tier) =>
    BigInt(tier.price) < BigInt(min.price) ? tier : min,
  );
  return formatTokenAmount(cheapest.price, cheapest.payTokenSymbol);
}

/**
 * Responsive discovery card for a single event. Uses a plain <img> (no
 * next/image) so it renders cleanly under jsdom in tests and needs no loader
 * config for remote fixture images.
 */
export function EventCard({ event }: { event: EventView }) {
  const from = lowestPrice(event);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={event.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold leading-tight">{event.name}</h2>
        <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">
          {event.description}
        </p>
        <dl className="mt-auto space-y-1.5 text-sm text-neutral-600 dark:text-neutral-400">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            <dd>{formatEventDate(event.startsAt)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <dd>{event.location}</dd>
          </div>
        </dl>
        <div className="flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            <Ticket className="h-4 w-4" aria-hidden="true" />
            {event.tiers.length} tier{event.tiers.length === 1 ? "" : "s"}
          </span>
          {from ? (
            <span className="text-sm font-semibold text-brand">
              from {from}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
