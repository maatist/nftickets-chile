import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("home page", () => {
  it("renders the discovery heading", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /discover events/i }),
    ).toBeInTheDocument();
  });

  it("renders the brand label in the nav", () => {
    render(<HomePage />);
    expect(screen.getAllByText(/nftickets chile/i).length).toBeGreaterThan(0);
  });
});
