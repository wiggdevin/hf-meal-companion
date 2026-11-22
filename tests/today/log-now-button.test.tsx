/** @vitest-environment jsdom */
/**
 * Fast logging (2026-11-21): one tap from Today's header opens the log sheet on the meal card that is
 * due (the first unticked one): capture, recents, favorites and search in one place.
 */
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogNowButton from "@/components/today/LogNowButton";

afterEach(() => cleanup());

describe("LogNowButton", () => {
  it("is one labelled 44 px tap target that opens a dialog and never wraps or shrinks", () => {
    const onOpen = vi.fn();
    render(<LogNowButton onOpen={onOpen} />);
    const button = screen.getByRole("button", { name: "Log what you ate" });
    for (const name of ["tap", "h-11", "shrink-0", "whitespace-nowrap"]) expect(button.className).toContain(name);
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("Today's wiring", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../../app/page.tsx"), "utf8");

  it("opens the log sheet on the focus meal (the next unticked one)", () => {
    expect(page).toContain('<LogNowButton onOpen={() => openCardPanel(() => { setLogSlot(focusSlotId); setLogOpen("food"); })} />');
  });

  it("answers a /log link once mounted, with the slot checked against the day", () => {
    expect(page).toMatch(/useLogIntent\(mounted,/);
    expect(page).toContain("const daySlot = slotOnDay(slot, resolved.slots);");
    expect(page).toContain('openCardPanel(() => { setLogSlot(daySlot); setLogOpen("food"); })');
  });

  it("opens the scan ready screen for a barcode link, never the camera", () => {
    expect(page).toContain('if (open.kind === "scan") setScanReady(true);');
    expect(page).toContain("onScan={() => { setScanReady(false); setScanOpen(true); }}");
  });

  it("clears the handed-off slot when a capture or scan closes", () => {
    expect(page).toContain("onClose={() => { setScanOpen(false); setHandoffSlot(null); }}");
    expect(page).toContain("onClose={() => { setScanResult(null); setScanRun(null); setHandoffSlot(null); }}");
    expect(page).toContain("onClose={() => { setCaptureMode(null); setHandoffSlot(null); }}");
    expect(page).toContain("onClose={() => { setScanReady(false); setHandoffSlot(null); }}");
    expect(page).not.toContain("sharedPhoto");
  });
});
