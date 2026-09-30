import { SiteNav } from "@/components/site-nav";
import { OrganizerDashboard } from "@/components/organizer-dashboard";

export const metadata = {
  title: "Organizer · NFTickets Chile",
  description:
    "Create events, upload metadata to IPFS, and monitor ticket sales and gate validations.",
};

export default function OrganizerPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <section className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Organizer
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Publish new events with tiered pricing and track live sales and
            entrance validations for each of your events.
          </p>
        </section>
        <OrganizerDashboard />
      </main>
    </>
  );
}
