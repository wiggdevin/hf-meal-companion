// @vitest-environment jsdom
/** Settings › "How High Frequency works": closed by default, opens the shared tour overview on tap. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HowItWorksCard from "./HowItWorksCard";

afterEach(cleanup);

describe("HowItWorksCard", () => {
  it("renders closed, with no overview dialog mounted", () => {
    render(<HowItWorksCard />);
    expect(screen.getByRole("button", { name: "Show me how it works" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders open, with the tour overview dialog, after a tap on its trigger", () => {
    render(<HowItWorksCard />);
    fireEvent.click(screen.getByRole("button", { name: "Show me how it works" }));
    expect(screen.getByRole("dialog", { name: "Meet High Frequency" })).toBeTruthy();
  });
});
