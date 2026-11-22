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
  it("is one labelled 44 px tap target that never wraps or shrinks", () => {
    const onOpen = vi.fn();
    render(<LogNowButton onOpen={onOpen} />);
    const button = screen.getByRole("button", { name: "Log what you ate" });
    for (const name of ["tap", "h-11", "shrink-0", "whitespace-nowrap"]) expect(button.className).toContain(name);
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("announces a dialog only when it opens the modal sheet", () => {
    const { rerender } = render(<LogNowButton onOpen={vi.fn()} opensDialog={false} />);
    expect(screen.getByRole("button", { name: "Log what you ate" }).hasAttribute("aria-haspopup")).toBe(false);
    rerender(<LogNowButton onOpen={vi.fn()} opensDialog />);
    expect(screen.getByRole("button", { name: "Log what you ate" }).getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("returns focus to the pill when the inset panel it opened closes", () => {
    const { rerender } = render(<><LogNowButton onOpen={vi.fn()} /><input aria-label="In the panel" /></>);
    const button = screen.getByRole("button", { name: "Log what you ate" });
    fireEvent.click(button);
    rerender(<><LogNowButton onOpen={vi.fn()} panelOpen /><input aria-label="In the panel" /></>);
    screen.getByLabelText("In the panel").focus();
    rerender(<><LogNowButton onOpen={vi.fn()} panelOpen={false} /><input aria-label="In the panel" /></>);
    expect(document.activeElement).toBe(button);
  });

  it("leaves focus alone when a panel it did not open closes", () => {
    const { rerender } = render(<><LogNowButton onOpen={vi.fn()} panelOpen /><input aria-label="In the panel" /></>);
    const input = screen.getByLabelText("In the panel");
    input.focus();
    rerender(<><LogNowButton onOpen={vi.fn()} panelOpen={false} /><input aria-label="In the panel" /></>);
    expect(document.activeElement).toBe(input);
  });
});

describe("Today's wiring", () => {
  const page = fs.readFileSync(path.resolve(__dirname, "../../app/page.tsx"), "utf8");

  it("opens the log sheet on the focus meal (the next unticked one)", () => {
    expect(page).toContain('<LogNowButton onOpen={() => openCardPanel(() => { setLogSlot(focusSlotId); setLogOpen("food"); })}');
    expect(page).toContain("opensDialog={!focusSlotId} panelOpen={logOpen !== null} />");
  });

  it("answers a /log link once mounted, with the slot checked against the day", () => {
    expect(page).toMatch(/<Suspense fallback=\{null\}>\s*<LogIntentWatcher /);
    expect(page).toContain("onOpen={openLogRequest} />");
    expect(page).toContain("const daySlot = slotOnDay(slot, resolved.slots);");
    expect(page).toContain('openCardPanel(() => { setLogSlot(daySlot); setLogOpen("food"); })');
  });

  it("keeps the requested slot when a capture's Search your foods or Search manually opens search", () => {
    expect(page).toContain("onOpenSearch={() => { const slot = handoffSlot; setCaptureMode(null); setHandoffSlot(null);");
    expect(page).toContain('openCardPanel(() => { setLogSlot(slot); setLogOpen("food"); }); }}');
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
