import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The layout mounts client providers (Wagmi/React Query) and the service-worker
// registrar. Stub them so this test focuses on "layout renders its children"
// without needing a full provider stack in jsdom.
vi.mock("@/components/app-providers", () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/components/service-worker-register", () => ({
  ServiceWorkerRegister: () => null,
}));

import RootLayout from "./layout";

describe("root layout", () => {
  it("renders the html/body shell and its children without crashing", () => {
    // The layout renders <html>/<body>, which cannot be mounted inside jsdom's
    // container; render to static markup to assert the shell and children.
    const markup = renderToStaticMarkup(
      <RootLayout>
        <div data-testid="child">hello</div>
      </RootLayout>,
    );
    expect(markup).toContain("<html");
    expect(markup).toContain("<body");
    expect(markup).toContain('data-testid="child"');
    expect(markup).toContain("hello");
  });
});
