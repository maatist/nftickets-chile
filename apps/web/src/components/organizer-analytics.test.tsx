import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsView } from "@/providers/data";

// Route analytics through a controllable mock DataProvider.
const getOrganizerAnalytics = vi.fn<() => Promise<AnalyticsView>>();
vi.mock("@/providers/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/data")>();
  return {
    ...actual,
    getDataProvider: () => ({
      listEvents: vi.fn(),
      getMyTickets: vi.fn(),
      getOrganizerAnalytics,
    }),
  };
});

import { OrganizerAnalytics } from "./organizer-analytics";
import { MockDataProvider } from "@/providers/data";

afterEach(() => {
  vi.clearAllMocks();
});

describe("OrganizerAnalytics", () => {
  it("renders sales and validation counts from the mock DataProvider", async () => {
    // Use the real mock provider's analytics as the source of truth.
    const analytics = await new MockDataProvider().getOrganizerAnalytics("1");
    getOrganizerAnalytics.mockResolvedValue(analytics);

    render(<OrganizerAnalytics eventId="1" eventName="Fauna Primavera 2025" />);

    await waitFor(() => {
      expect(screen.getByTestId("organizer-analytics")).toBeInTheDocument();
    });

    // Totals (formatted with locale separators via toLocaleString).
    expect(screen.getByTestId("analytics-total-sold")).toHaveTextContent(
      analytics.totalSold.toLocaleString(),
    );
    expect(screen.getByTestId("analytics-total-validated")).toHaveTextContent(
      analytics.totalValidated.toLocaleString(),
    );

    // Per-tier breakdown shows each tier's sold + validated counts.
    for (const row of analytics.perTier) {
      const tierRow = screen.getByTestId(`analytics-tier-${row.tier}`);
      expect(within(tierRow).getByText(row.name)).toBeInTheDocument();
      expect(tierRow).toHaveTextContent(row.sold.toLocaleString());
      expect(tierRow).toHaveTextContent(row.validated.toLocaleString());
    }
  });

  it("shows an error state when analytics fail to load", async () => {
    getOrganizerAnalytics.mockRejectedValue(new Error("provider down"));
    render(<OrganizerAnalytics eventId="1" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/provider down/i);
    });
  });
});
