import { describe, expect, it } from "vitest";
import { completedIdeasReply } from "@/lib/coach/completed-ideas";
import type { ComposedMeal } from "@/lib/coach/compose";
import type { UiBlock } from "@/lib/coach/ui-blocks";
const meal: ComposedMeal = { wish: "chicken wrap", slot: null, items: [{ name: "Chicken breast, roasted",
  foodRefId: "ref", catalogFoodRevisionId: 1, grams: 100, kcalPer100g: 165, proteinPer100g: 31,
  carbsPer100g: 0, fatPer100g: 4, macros: { kcal: 165, protein: 31, carbs: 0, fat: 4 }, verdict: "allowed" }],
  totals: { kcal: 165, protein: 31, carbs: 0, fat: 4 }, target: { kcal: 300, protein: 9, carbs: 40, fat: 8 },
  flagged: [], fitsTarget: false, fitNote: "Over on protein by 22 g for this slot" };
const blocks = (meals: ComposedMeal[]): UiBlock[] => [{ kind: "food_ideas", id: "i", v: 1, ideas: meals }];
const call = (result?: unknown) => [{ name: "compose_meal", ok: true, result }];
const ask = "make me a chicken wrap that fits my macros";

describe("truthful completed-card review copy", () => {
  it("keeps a valid non-fitting composition without inventing a dish or target fit", () => {
    expect(completedIdeasReply(ask, call(), [meal], blocks([meal])))
      .toBe("Here is 1 option to review. Over on protein by 22 g for this slot.");
  });
  it("preserves the fitting single-set shortcut", () => {
    const fit = { ...meal, fitsTarget: true, fitNote: null };
    expect(completedIdeasReply(ask, call(), [fit], blocks([fit])))
      .toBe("Here are 1 meal ideas. The cards show portions and target fit.");
  });
  it("keeps exact shortfalls and leaves omitted food terms on the card", () => {
    const changed = { ...meal, fitsTarget: true, fitNote: null,
      shortfallNote: "2 of 3 fit your remaining macros", leftOut: [{ term: "chicken parmesan", why: "not_found" as const }] };
    const text = completedIdeasReply(ask, call(), [changed, changed], blocks([changed, changed]));
    expect(text).toBe("Here are 2 options to review. 2 of 3 fit your remaining macros. The card shows what was left out.");
    expect(text).not.toContain("chicken");
  });
  it("keeps gated provenance and partial messages exactly once", () => {
    const notice = "Shared recipe discovery is unavailable. These are checked meal ideas instead, not complete recipes.";
    const message = "Only one option could be checked.";
    const text = completedIdeasReply(ask, call({ notice, message }), [meal], blocks([meal]), message)!;
    expect(text.startsWith(notice)).toBe(true);
    expect(text.split(message)).toHaveLength(2);
    expect(text.indexOf("Here is")).toBeGreaterThan(text.indexOf(notice));
    expect(text.indexOf(message)).toBeGreaterThan(text.indexOf(meal.fitNote!));
  });
  it("continues holding refused ingredients and invalid or empty cards", () => {
    for (const changed of [{ ...meal, refusals: ["Cheese was refused."] },
      { ...meal, items: [{ ...meal.items[0], grams: 0 }] }, { ...meal, incomplete: { reason: "incoherent" } },
      { ...meal, items: [{ ...meal.items[0], verdict: "blocked" as const }] },
      { ...meal, items: [{ ...meal.items[0], foodRefId: "" }] }]) {
      expect(completedIdeasReply(ask, call(), [changed], blocks([changed]))).toBeNull();
    }
    expect(completedIdeasReply(ask, call({ refusals: ["Cheese was refused."] }), [meal], blocks([meal]))).toBeNull();
  });
  it("contains no authored fit/safety claim or food name after copied server notes are removed", () => {
    const changed = { ...meal, shortfallNote: "Only one option could be checked.",
      leftOut: [{ term: "cheese", why: "not_found" as const }] };
    const text = completedIdeasReply(ask, call(), [changed], blocks([changed]))!;
    const authored = text.replace(meal.fitNote!, "").replace(changed.shortfallNote, "");
    expect(authored).not.toMatch(/\b(?:fits?|target|within|safe|allowed)\b/i);
    expect(authored.toLowerCase()).not.toContain("chicken");
    expect(authored.toLowerCase()).not.toContain("cheese");
  });
});
