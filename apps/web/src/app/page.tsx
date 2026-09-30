import { SiteNav } from "@/components/site-nav";
import { EventFeed } from "@/components/event-feed";

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <section className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Discover events
          </h1>
          <p className="mt-2 max-w-2xl text-balance text-neutral-600 dark:text-neutral-400">
            ERC-1155 tickets with on-chain resale caps and dynamic, time-
            sensitive EIP-712 QR codes. Running on Base Sepolia with a mocked
            Web3 layer for local development.
          </p>
        </section>
        <EventFeed />
      </main>
    </>
  );
}
