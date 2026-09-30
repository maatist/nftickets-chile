import { SiteNav } from "@/components/site-nav";
import { MyTickets } from "@/components/my-tickets";

export default function TicketsPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <section className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            My Tickets
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Open a ticket to reveal its live entry QR. The code refreshes on a
            timer so screenshots expire.
          </p>
        </section>
        <MyTickets />
      </main>
    </>
  );
}
