import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventView } from "@/providers/data";
import { MockDataProvider } from "@/providers/data";

// Route the feed's provider resolution through the mock DataProvider so we
// assert the UI renders exactly what the DataProvider returns.
const listEvents = vi.fn<() => Promise<EventView[]>>();
vi.mock("@/providers/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/data")>();
  return {
    ...actual,
    getDataProvider: () => ({
      listEvents,
      getMyTickets: vi.fn(),
      getOrganizerAnalytics: vi.fn(),
    }),
  };
});

import { EventFeed } from "./event-feed";

afterEach(() => {
  vi.clearAllMocks();
});

describe("EventFeed", () => {
  it("renders event cards from the mock DataProvider fixtures", async () => {
    // Use the real mock provider's fixtures as the source of truth.
    const fixtures = await new MockDataProvider().listEvents();
    listEvents.mockResolvedValue(fixtures);

    render(<EventFeed />);

    await waitFor(() => {
      expect(screen.getByText(fixtures[0]!.name)).toBeInTheDocument();
    });
    for (const event of fixtures) {
      expect(screen.getByText(event.name)).toBeInTheDocument();
    }
  });

  it("shows an empty state when there are no events", async () => {
    listEvents.mockResolvedValue([]);
    render(<EventFeed />);
    await waitFor(() => {
      expect(screen.getByText(/no events available/i)).toBeInTheDocument();
    });
  });
});
