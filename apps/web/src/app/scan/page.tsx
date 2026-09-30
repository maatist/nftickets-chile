import { SiteNav } from "@/components/site-nav";
import { GateScanner } from "@/components/gate-scanner";

export const metadata = {
  title: "Gate Scanner · NFTickets Chile",
  description:
    "Scan a ticket QR to verify its signature, freshness, and on-chain state before granting entry.",
};

export default function ScanPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-md px-4 py-8">
        <section className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Gate Scanner
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Point the camera at a ticket QR. We verify the signature and
            freshness locally, then check the chain and validate entry. Offline,
            validations are queued and submitted once you reconnect.
          </p>
        </section>
        <GateScanner />
      </main>
    </>
  );
}
