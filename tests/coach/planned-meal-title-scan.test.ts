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
import { plannedMealTitles, withoutPlannedMealTitles } from "@/lib/coach/plan-report";
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

const ALMOND = "00000000-0000-4000-8000-0000000000a3";
const almondEvidence = { "Almond milk, unsweetened": { foodRefId: ALMOND, allergenTags: [], category: [],
  onEatsList: true, onAvoidList: false } };
const almondBreakfast = (title: string) => ({
  actionId: "a2", kind: "set_slot_meal", from: "2026-11-18", through: "2026-11-18",
  date: "2026-11-18", dates: ["2026-11-18"], slot: "meal-1", title, flagged: [],
  items: [item("Almond milk, unsweetened", ALMOND)],
}) as unknown as CoachAction;

async function failingWith(text: string, actions: CoachAction[], ev: Record<string, unknown>) {
  const scan = await startReplyScan({ userId: "u", text, named: [], evidence: ev as typeof evidence,
    profile: { ...EMPTY_PROFILE, avoid_allergens: ["milk"] }, actions }, ports, Date.now() + 1000);
  return scan.failing.map((f) => f.name.toLowerCase());
}

describe("Sol review 2026-11-18: the title exemption covers only the confirmation", () => {
  it("does not accept a title that drops a food's identity word (almond milk titled Milk)", async () => {
    expect((await failingWith("I set your breakfast to Milk.", [almondBreakfast("Milk")], almondEvidence))
      .length).toBeGreaterThan(0);
  });

  it("still scans a later recommendation that repeats the title's words", async () => {
    expect((await failingWith("I set your breakfast to Almond milk. Drink milk with every meal.",
      [almondBreakfast("Almond milk")], almondEvidence)).length).toBeGreaterThan(0);
  });

  it("keeps the qualified title when the reply only confirms it", async () => {
    expect(await failingWith("I set your breakfast to Almond milk.",
      [almondBreakfast("Almond milk")], almondEvidence)).toEqual([]);
  });

  it("blocks the review's exact case: Milk title then a milk recommendation", async () => {
    expect((await failingWith("I set your breakfast to Milk. Drink milk with every meal.",
      [almondBreakfast("Milk")], almondEvidence)).length).toBeGreaterThan(0);
  });
});

describe("audit round 2026-11-18: full-name identity and confirmation-only strip", () => {
  const one = (name: string, title: string) => ({
    actionId: "a3", kind: "set_slot_meal", from: "2026-11-18", through: "2026-11-18",
    date: "2026-11-18", dates: ["2026-11-18"], slot: "meal-1", title, flagged: [],
    items: [item(name, ALMOND)],
  }) as unknown as CoachAction;

  it.each([["Milk, cashew", "Milk"], ["Bread, gluten-free", "Bread"], ["Cream of rice", "Cream"],
    ["Cheese, cheddar", "Cheese"]])("does not accept %s titled %s", (name, title) => {
    expect(plannedMealTitles([one(name, title)])).toEqual([]);
  });

  it("accepts natural titles of the same foods", () => {
    expect(plannedMealTitles([one("Milk, cashew", "Cashew milk")])).toEqual(["Cashew milk"]);
    expect(plannedMealTitles([planned("Sautéed chicken and rice")])).toEqual(["Sautéed chicken and rice"]);
  });

  it("strips only the confirming sentence, even when advice comes first", () => {
    expect(withoutPlannedMealTitles("Oat milk is fine. I set your breakfast to Oat milk.", ["Oat milk"]))
      .toBe("Oat milk is fine. I set your breakfast to .");
    expect(withoutPlannedMealTitles("I set your breakfast to Oat milk. Lunch is Oat milk too.", ["Oat milk"]))
      .toBe("I set your breakfast to . Lunch is Oat milk too.");
  });
});

describe("Grok audit 2026-11-18: a title is not stripped out of a longer dish name", () => {
  it("keeps 'nuggets' when the title is Chicken", () => {
    expect(withoutPlannedMealTitles("Chicken nuggets are an easy lunch. I set dinner to Chicken.", ["Chicken"]))
      .toBe("Chicken nuggets are an easy lunch. I set dinner to .");
    expect(withoutPlannedMealTitles("I set dinner to Chicken nuggets.", ["Chicken"]))
      .toBe("I set dinner to Chicken nuggets.");
    expect(withoutPlannedMealTitles("I set dinner to Chicken for tonight.", ["Chicken"]))
      .toBe("I set dinner to  for tonight.");
  });
});
