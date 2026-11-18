/**
 * Weak-spot audit 2026-11-17 item 6: "Plan grilled chicken and rice for dinner" lost its plan
 * change because the reply scan searched the catalog for the meal's TITLE ("Grilled chicken and
 * rice"), found no row by that name and held it as unchecked. A title of a meal this turn set, whose
 * every item grounded to an allowed food, is that meal's name, not a food. An unchecked item, or a
 * title word that names a food outside the meal, is still judged.
 */
import { describe, expect, it } from "vitest";
import type { CoachAction } from "@/lib/coach/actions";
import { startReplyScan } from "@/lib/server/reply-check";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";

const CHICKEN = "00000000-0000-4000-8000-0000000000a1";
const RICE = "00000000-0000-4000-8000-0000000000a2";
const evidence = {
  "Chicken breast, roasted": { foodRefId: CHICKEN, allergenTags: [], category: [],
    onEatsList: true, onAvoidList: false },
  "White rice, cooked": { foodRefId: RICE, allergenTags: [], category: [],
    onEatsList: true, onAvoidList: false },
};
const profile = { ...EMPTY_PROFILE, avoid_allergens: ["gluten"] };
const ports = { searchFoods: async () => [], profileRules: async () => null };
const item = (name: string, foodRefId: string, verdict: "allowed" | "unverified" = "allowed") => ({
  name, grams: 150, foodRefId, catalogFoodRevisionId: 1, kcalPer100g: 150, proteinPer100g: 20,
  carbsPer100g: 10, fatPer100g: 3, verdict });
const planned = (title: string, verdict: "allowed" | "unverified" = "allowed") => ({
  actionId: "a1", kind: "set_slot_meal", from: "2026-11-18", through: "2026-11-18",
  date: "2026-11-18", dates: ["2026-11-18"], slot: "meal-3", title, flagged: [],
  items: [item("Chicken breast, roasted", CHICKEN), item("White rice, cooked", RICE, verdict)],
}) as unknown as CoachAction;

async function failing(text: string, actions: CoachAction[]) {
  const scan = await startReplyScan({ userId: "u", text, named: [], evidence, profile, actions },
    ports, Date.now() + 1000);
  return scan.failing.map((f) => f.name.toLowerCase());
}

describe("a meal this turn planned is not scanned as an unknown food", () => {
  it("keeps a set_slot_meal titled from its own checked items", async () => {
    expect(await failing("I set your dinner to Grilled chicken and rice.",
      [planned("Grilled chicken and rice")])).toEqual([]);
  });

  it("still holds the title when an item in that meal is unchecked", async () => {
    expect((await failing("I set your dinner to Grilled chicken and rice.",
      [planned("Grilled chicken and rice", "unverified")])).length).toBeGreaterThan(0);
  });

  it("still judges a title word that names a food outside the meal", async () => {
    expect((await failing("I set your dinner to Chicken and rice with toast.",
      [planned("Chicken and rice with toast")])).length).toBeGreaterThan(0);
  });

  it("still judges the title when no meal was planned this turn", async () => {
    expect((await failing("I set your dinner to Grilled chicken and rice.", [])).length)
      .toBeGreaterThan(0);
  });
});
