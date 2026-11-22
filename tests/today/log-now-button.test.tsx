/** @vitest-environment jsdom */
/**
 * Fast logging (2026-11-21): one tap from Today's header opens the log sheet for the current (or
 * next) meal: capture, recents, favorites and search in one place.
 */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogNowButton from "@/components/today/LogNowButton";

afterEach(() => cleanup());

describe("LogNowButton", () => {
  it("is one labelled tap target that opens the log", () => {
    const onOpen = vi.fn();
    render(<LogNowButton onOpen={onOpen} />);
    const button = screen.getByRole("button", { name: "Log what you ate" });
    expect(button.className).toContain("tap");
    expect(button.className).toContain("h-11");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("Today's wiring", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../../app/page.tsx"), "utf8");

  it("puts the Log button in the header and opens the log sheet for the current slot", () => {
    expect(page).toMatch(/<LogNowButton onOpen=\{\(\) => openCardPanel\(\(\) => setLogOpen\("food"\)\)\} \/>/);
  });

  it("answers a /log link once mounted", () => {
    expect(page).toMatch(/useLogIntent\(mounted,/);
    expect(page).toMatch(/initialFile=\{sharedPhoto\}/);
  });
});
