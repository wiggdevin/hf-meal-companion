// @vitest-environment jsdom
/**
 * Fast logging (2026-11-21): "Same as yesterday" on an empty meal card. Today hands it only for a
 * day that has happened, only when yesterday's slot holds re-loggable entries, with a durable key;
 * it says what it copies and leaves out, and waits while any re-log runs.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SlotCard from "@/components/SlotCard";
import SameAsYesterday from "@/components/today/SameAsYesterday";
import type { ResolvedSlot } from "@/lib/types";
import { EGG, entry, item } from "../log/fast/relog-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
afterEach(cleanup);

const EMPTY_SLOT: ResolvedSlot = {
  slot: "meal-1", time: "08:00", label: "Breakfast", meal: null, components: [],
  macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, eaten: false,
};
const eggs = entry("eggs", "2026-11-20T08:00:00Z", [item(EGG, 150)]);
const coffee = entry("coffee", "2026-11-20T08:10:00Z", [item(EGG, 10)], { name: "Coffee", rev: undefined });

describe("Same as yesterday on a meal card", () => {
  it("shows only when Today hands the card one", () => {
    const card = (node?: React.ReactNode) => renderToStaticMarkup(
      <SlotCard slot={EMPTY_SLOT} variant="focus" canSwap onToggleEaten={() => {}} onOpenSwap={() => {}}
        sameAsYesterday={node} />);
    expect(card()).not.toContain("Same as yesterday");
    expect(card(<SameAsYesterday copy={[eggs]} omitted={[]} busy={false} onLog={() => {}} />)).toContain("Same as yesterday");
  });

  it("says what it copies and leaves out, logs on tap, and waits while a re-log runs", () => {
    const onLog = vi.fn();
    const { rerender } = render(<SameAsYesterday copy={[eggs]} omitted={[coffee]} busy={false} onLog={onLog} />);
    const button = screen.getByRole("button", { name: "Same as yesterday" }) as HTMLButtonElement;
    expect(screen.getByText("Copies Eggs. Leaves out Coffee, not saved yet or not rebuildable.")).toBeTruthy();
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(button);
    expect(onLog).toHaveBeenCalledTimes(1);
    rerender(<SameAsYesterday copy={[eggs]} omitted={[coffee]} busy onLog={onLog} />);
    expect((screen.getByRole("button", { name: "Same as yesterday" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders nothing when nothing can be copied", () => {
    const { container } = render(<SameAsYesterday copy={[]} omitted={[coffee]} busy={false} onLog={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("is handed one only for a day that has happened, with a durable key and the shared pending state", () => {
    const page = fs.readFileSync(path.resolve(__dirname, "../../app/page.tsx"), "utf8");
    expect(page).toContain("const yesterday = viewedDate <= todayIso ? yesterdayInSlot(store.days, viewedDate, slot.slot) : null;");
    expect(page).toMatch(/sameAsYesterday=\{yesterday && yesterday\.copy\.length > 0 \? <SameAsYesterday \{\.\.\.yesterday\} busy=\{relogs\.pending\}/);
    expect(page).toContain("durableKey: sameAsYesterdayKey(viewedDate, slot.slot)");
  });
});
