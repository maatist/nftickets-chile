import { expect, test } from "@playwright/test";

/**
 * Happy-path end-to-end test over the MOCK providers (Requirement R13.4).
 *
 * Traverses the full flow a user/organizer experiences locally:
 *   1. Discovery feed renders seeded events.
 *   2. Organizer dashboard renders live analytics; the creation modal opens,
 *      accepts input, submits, and reports success (metadata "pinned" via the
 *      mock StorageProvider; createEvent/addTier via the mock AuthProvider).
 *   3. My Tickets: log in (mock signer = seeded owner) and reveal a dynamic
 *      EIP-712 QR for an owned ticket.
 *   4. Gate scanner view renders (camera degrades gracefully in headless).
 *
 * Everything is deterministic and credential-free because the webServer forces
 * the mock provider flags (see playwright.config.ts).
 */
test.describe("NFTickets happy path (mocks)", () => {
  test("discovery → organizer create → my tickets QR → scan", async ({
    page,
  }) => {
    // 1. Discovery feed
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /discover events/i }),
    ).toBeVisible();
    // A seeded event from the fixtures should render in the feed.
    await expect(page.getByText("Fauna Primavera 2025").first()).toBeVisible();

    // 2. Organizer dashboard + analytics + event creation
    await page.goto("/organizer");
    await expect(
      page.getByRole("heading", { name: "Organizer" }),
    ).toBeVisible();
    // At least one analytics panel renders (sold / validated counts).
    await expect(
      page.getByTestId("organizer-analytics").first(),
    ).toBeVisible();
    await expect(page.getByText(/tickets sold/i).first()).toBeVisible();

    // Open the creation modal and fill the minimal required fields.
    await page.getByRole("button", { name: /new event/i }).click();
    const dialog = page.getByRole("dialog", { name: /create event/i });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder("42").fill("777");
    await dialog.getByPlaceholder("Fauna Primavera 2026").fill("E2E Test Fest");
    // First tier row: give it a name so the created event is meaningful.
    await dialog.getByLabel("Tier 0 name").fill("General");

    await dialog
      .getByRole("button", { name: "Create event", exact: true })
      .click();

    // On success the mock StorageProvider "pins" metadata and the mock
    // AuthProvider "sends" createEvent/addTier; the dashboard's onCreated
    // callback then closes the modal and refreshes analytics. Asserting the
    // dialog closes is the stable signal that the submit succeeded (the inline
    // success banner is transient because the parent unmounts the modal).
    await expect(dialog).toBeHidden();

    // 3. My Tickets — log in, then reveal the dynamic QR for an owned ticket.
    await page.goto("/tickets");
    await expect(
      page.getByRole("heading", { name: /my tickets/i }),
    ).toBeVisible();

    // Logged out first: a login prompt is shown.
    await page.getByRole("button", { name: /log in/i }).click();

    // After login the seeded VIP ticket for the mock signer appears.
    await expect(page.getByText("Fauna Primavera 2025").first()).toBeVisible();

    // Reveal the live entry QR on the first non-used ticket.
    await page.getByRole("button", { name: /show entry qr/i }).first().click();
    const qr = page.getByTestId("ticket-qr");
    await expect(qr).toBeVisible();
    // The QR is a signed data-URL image and carries a freshness timestamp.
    await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect(qr).toHaveAttribute("data-timestamp", /^\d+$/);

    // 4. Gate scanner view renders (verification pipeline; camera optional).
    await page.goto("/scan");
    await expect(
      page.getByRole("heading", { name: /gate scanner/i }),
    ).toBeVisible();
    // The scanner shell renders whether or not a camera is available.
    await expect(page.getByText(/online|offline/i).first()).toBeVisible();
  });
});
