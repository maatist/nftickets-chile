import Link from "next/link";
import { Compass, LayoutDashboard, ScanLine, Ticket } from "lucide-react";

/**
 * Top navigation for the PWA shell. Kept minimal and touch-friendly: the brand
 * links home (discovery feed) and a "My Tickets" link opens the dashboard.
 * Sticky so it stays reachable on mobile while scrolling long feeds.
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-semibold tracking-tight"
        >
          <Ticket className="h-5 w-5 text-brand" aria-hidden="true" />
          <span>NFTickets Chile</span>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Compass className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Discover</span>
          </Link>
          <Link
            href="/organizer"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Organizer</span>
          </Link>
          <Link
            href="/scan"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <ScanLine className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Scan</span>
          </Link>
          <Link
            href="/tickets"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 font-medium text-brand-fg hover:opacity-90"
          >
            <Ticket className="h-4 w-4" aria-hidden="true" />
            <span>My Tickets</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
