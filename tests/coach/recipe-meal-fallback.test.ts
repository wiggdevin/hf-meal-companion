import { describe, expect, it, vi } from "vitest";
import { defaultPorts } from "@/lib/server/coach-ports";
import { hydrateResolvedTool } from "@/lib/coach/blocks";
import { fastSuggestionReply } from "@/lib/server/coach-turn/fast-path-copy";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";
import type { ComposedMeal } from "@/lib/coach/compose";
import { REQUIRES_PREPARATION_MESSAGE } from "@/lib/coach/suggest-messages";

vi.mock("@/lib/server/recipe-access", () => ({ recipeAccessEnabled: () => false }));
const meal: ComposedMeal = { wish: "no-cook", slot: null, items: [{ name: "Avocado",
  foodRefId: "avocado", catalogFoodRevisionId: 1, grams: 100, kcalPer100g: 160,
  proteinPer100g: 2, carbsPer100g: 8, fatPer100g: 15,
  macros: { kcal: 160, protein: 2, carbs: 8, fat: 15 }, verdict: "allowed" }],
  totals: { kcal: 160, protein: 2, carbs: 8, fat: 15 },
  target: { kcal: 160, protein: 2, carbs: 8, fat: 15 }, flagged: [], fitsTarget: true };

describe("gated no-cook recipe discovery offers only checked meal ideas", () => {
  it("passes the unchanged no-cook wish to the existing meal admission/evidence engine", async () => {
    const ports = defaultPorts({} as never, {} as never, () => "id", { date: "2026-11-15", tz: "UTC" });
    const recipe = ports.suggest;
    const admittedMeals = vi.fn().mockResolvedValue([meal]);
    ports.suggest = admittedMeals;
    expect(await recipe("owner", { kind: "recipe", wish: "recipes without cooking", count: 3 })).toEqual([meal]);
    expect(admittedMeals).toHaveBeenCalledWith("owner", expect.objectContaining({
      kind: "meal", wish: "recipes without cooking", count: 3,
    }));
  });

  it("keeps the explicit no-cook evidence failure and does not invent complete recipes", async () => {
    const ports = defaultPorts({} as never, {} as never, () => "id", { date: "2026-11-15", tz: "UTC" });
    const recipe = ports.suggest;
    ports.suggest = vi.fn().mockResolvedValue(Object.assign([], {
      message: REQUIRES_PREPARATION_MESSAGE,
    }));
    expect(await recipe("owner", { kind: "recipe", wish: "no cooking" })).toMatchObject({
      candidates: [], noResultReasons: [expect.stringContaining(REQUIRES_PREPARATION_MESSAGE)],
    });
  });

  it("never turns a one-off ingredient exclusion or a non-no-cook request into unfiltered meal ideas", async () => {
    const ports = defaultPorts({} as never, {} as never, () => "id", { date: "2026-11-15", tz: "UTC" });
    const recipe = ports.suggest;
    ports.suggest = vi.fn();
    for (const wish of ["no-cook without soy", "find chicken recipes"]) {
      expect(await recipe("owner", { kind: "recipe", wish })).toMatchObject({ candidates: [] });
    }
    expect(ports.suggest).not.toHaveBeenCalled();
  });

  it("renders the admitted result as food ideas and explicitly calls the fallback meal ideas", () => {
    const hydrated = hydrateResolvedTool("suggest_options", { kind: "recipe" }, [meal], {
      admin: {} as never, userId: "owner", date: "2026-11-15", tz: "UTC", context: null,
      profile: EMPTY_PROFILE, newId: () => "id",
    });
    expect(hydrated.block).toMatchObject({ kind: "food_ideas", ideas: [meal] });
    expect(hydrated.data).toMatchObject({ notice: expect.stringContaining("meal ideas") });
    expect(fastSuggestionReply("recipe", false, [meal])).toContain("meal ideas");
    expect(fastSuggestionReply("recipe", false, [meal])).not.toContain("complete recipes to review");
  });
});
