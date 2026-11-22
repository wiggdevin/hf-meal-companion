/**
 * Fast logging (2026-11-21): an empty meal card offers "Same as yesterday" when Today hands it one,
 * which it does only when yesterday's same slot held entries a re-log can rebuild.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SlotCard from "@/components/SlotCard";
import type { ResolvedSlot } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const EMPTY_SLOT: ResolvedSlot = {
  slot: "meal-1", time: "08:00", label: "Breakfast", meal: null, components: [],
  macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, eaten: false,
};

const card = (onSameAsYesterday?: () => void) => renderToStaticMarkup(
  <SlotCard slot={EMPTY_SLOT} variant="focus" canSwap onToggleEaten={() => {}} onOpenSwap={() => {}}
    onSameAsYesterday={onSameAsYesterday} />,
);

describe("Same as yesterday on a meal card", () => {
  it("shows only when Today hands the card one", () => {
    expect(card()).not.toContain("Same as yesterday");
    expect(card(() => {})).toContain("Same as yesterday");
  });

  it("is handed one only when yesterday's slot had re-loggable entries", () => {
    const page = fs.readFileSync(path.resolve(__dirname, "../../app/page.tsx"), "utf8");
    expect(page).toContain("const yesterday = yesterdayInSlot(store.days, viewedDate, slot.slot);");
    expect(page).toContain("onSameAsYesterday={yesterday.length > 0 ?");
  });
});
