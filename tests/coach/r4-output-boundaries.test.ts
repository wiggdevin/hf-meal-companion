import { describe, expect, it } from "vitest";
import { completedIdeasReply } from "@/lib/coach/completed-ideas";
import { catalogReviewIntent } from "@/lib/coach/catalog-review";
import { fastSuggestionReply } from "@/lib/server/coach-turn/fast-path-copy";
import { recipeSearchFromWish } from "@/lib/coach/recipe-query";
import { asksForNoCook, filterSuggestionCandidates, suggestionFoodIdentity } from "@/lib/coach/suggest-policy";
import { draftNamesBlocked } from "@/lib/coach/draft-guard";
import { readIntent } from "@/lib/server/coach-turn/intent";
import { localAvoidCommand } from "@/lib/profile/local-avoid-command";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";
import type { ComposedMeal } from "@/lib/coach/compose";
import type { UiBlock } from "@/lib/coach/ui-blocks";

const meal: ComposedMeal = { wish: "snack", slot: null, items: [{ name: "Avocado",
  foodRefId: "avocado", catalogFoodRevisionId: 1, grams: 100, kcalPer100g: 160,
  proteinPer100g: 2, carbsPer100g: 8, fatPer100g: 15,
  macros: { kcal: 160, protein: 2, carbs: 8, fat: 15 }, verdict: "allowed" }],
  totals: { kcal: 160, protein: 2, carbs: 8, fat: 15 },
  target: { kcal: 160, protein: 2, carbs: 8, fat: 15 }, flagged: [], fitsTarget: true };
const blocks = (ideas: ComposedMeal[]): UiBlock[] => [{ kind: "food_ideas", v: 1, id: "i", ideas }];
const calls = [{ name: "suggest_options", ok: true }];

describe("R4 completed output boundaries", () => {
  it("keeps useful completed cards but leaves caveated or mismatched results for an honest summary", () => {
    expect(completedIdeasReply("suggest a snack", calls, [meal], blocks([meal]))).not.toBeNull();
    for (const extra of [{ refusals: ["cheese: dairy"] }]) {
      const changed = { ...meal, ...extra };
      expect(completedIdeasReply("suggest a snack", calls, [changed], blocks([changed]))).toBeNull();
    }
    expect(completedIdeasReply("suggest two meals", calls, [meal, meal], blocks([meal]))).toBeNull();
    expect(completedIdeasReply("suggest two meals", [...calls, ...calls], [meal, meal], blocks([meal, meal]))).toBeNull();
    expect(completedIdeasReply("suggest a snack", calls, [meal], blocks([meal]), "Only one option could be checked.")).toContain("Only one option could be checked.");
    for (const text of ["show me my macros", "show me my totals", "suggest a snack and show my calories"]) {
      expect(completedIdeasReply(text, calls, [meal], blocks([meal]))).toBeNull();
    }
  });
  it("does not describe a non-fitting fast-path card as fitting the remaining target", () => {
    const text = fastSuggestionReply("snack", true, [{ ...meal, fitsTarget: false, fitNote: "Protein is below target." }]);
    expect(text).not.toContain("fit what you have left");
    expect(text).toContain("Protein is below target.");
  });
  it("preserves partial and portion shortfall disclosures in the gated recipe fallback", () => {
    const partial = Object.assign([meal], { partial: true as const, message: "Only one option could be checked." });
    const text = fastSuggestionReply("recipe", false, partial);
    expect(text).toContain("checked meal ideas instead");
    expect(text).toContain(partial.message);
    expect(fastSuggestionReply("recipe", false, [{ ...meal, shortfallNote: "Protein is below target." }]))
      .toContain("Protein is below target.");
  });
  it("binds membership review to the explicitly requested subject", () => {
    for (const text of ["show me salmon in the catalog so I can decide whether to avoid it",
      "show me salmon so I can decide whether to avoid it"]) {
      expect(catalogReviewIntent(text, "salmon")).toBe("avoid");
      expect(catalogReviewIntent(text, "chicken")).toBeNull();
    }
    for (const text of ["show salmon and chicken in the catalog so I can decide whether to avoid it",
      "find salmon in the catalog for dinner", "show salmon, then log it in the catalog so I can decide whether to avoid it"]) {
      expect(catalogReviewIntent(text)).toBeNull();
    }
  });
  it("holds short canonical aliases from completed Avoid-only evidence during draft streaming", () => {
    const found = { foodRefId: "tofu", allergenTags: [], category: [], onEatsList: false, onAvoidList: true };
    expect(draftNamesBlocked("Try tofu.", EMPTY_PROFILE, { "Tofu, firm": found })).toBe(true);
    expect(draftNamesBlocked("Try berries.", EMPTY_PROFILE, { "Tofu, firm": found })).toBe(false);
  });
  it("leaves a restriction answer in a clarification conversation on the model path", async () => {
    const read = await readIntent({ admin: {}, userId: "u", req: { text: "I can't do eggs anymore" },
      deps: {}, clock: { now: "2026-11-15T08:14:23Z" }, replyDeadlineAt: Date.now() + 1000 } as never,
    { history: Promise.resolve({ summary: null, pendingDraft: null,
      messages: [{ role: "assistant", content: "Which food did you mean?" }] }) } as never);
    expect(read.localAvoid).toBeUndefined();
    expect(read.intentReason).toBe("clarifying");
  });
  it("accepts standalone food nouns, never bare modifiers", () => {
    for (const word of ["raw", "canned", "sweet", "greek", "red", "water", "dried", "mixed", "ground", "skin"]) {
      expect(localAvoidCommand(`I can't do ${word} anymore`)).toBeNull();
    }
    for (const word of ["eggs", "tofu", "chicken", "milk"]) {
      expect(localAvoidCommand(`I can't do ${word} anymore`)).toBe(word);
    }
  });
  it.each(["without needing to cook", "without having to cook", "without  cooking", "ready-to-eat", "no-cook"])
  ("uses the same no-cook interpretation and real candidate filter: %s", (phrase) => {
    const wish = `recipes ${phrase}`;
    expect(recipeSearchFromWish(wish).search.effort).toBe("none");
    expect(asksForNoCook(wish)).toBe(true);
    const identity = suggestionFoodIdentity(meal.items[0]);
    const facts = { foodName: "Avocado", foodBrand: null, allergenTags: [], checkedAllergens: [],
      policyCategories: [], facets: {}, noCook: false,
      onEatsList: true, onAvoidList: false, role: null };
    const candidate = { meal, fit: 1, index: 0 };
    const evidence = { status: "ready" as const, preferenceFlags: [], byIdentity: { [identity]: facts } };
    expect(filterSuggestionCandidates([candidate], evidence, EMPTY_PROFILE, asksForNoCook(wish)))
      .toMatchObject({ candidates: [], requiresPreparation: 1 });
    facts.noCook = true;
    expect(filterSuggestionCandidates([candidate], evidence, EMPTY_PROFILE, asksForNoCook(wish)).candidates)
      .toHaveLength(1);
  });
});
