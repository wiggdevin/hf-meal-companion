import { describe, expect, it, vi } from "vitest";
import type { FoodHit } from "@/lib/coach/executors";
import { defaultPorts } from "@/lib/server/coach-ports";

const state = vi.hoisted(() => ({ hit: null as FoodHit | null, failed: false }));
vi.mock("@/lib/server/eats-own-food", () => ({ eatsOwnFood: () => async () => {
  if (state.failed) throw new Error("lookup failed");
  return state.hit;
} }));
vi.mock("@/lib/coach/suggest", () => ({ suggestOptions: async (_args: unknown, ports: {
  ownFood: (uid: string, name: string) => Promise<FoodHit | null>;
}) => { await ports.ownFood("u1", "Chicken breast, roasted"); return []; } }));
vi.mock("@/lib/server/day-context", () => ({ buildDayContext: async () => ({
  date: "2026-11-15", slots: [], targets: { kcal: 2000, protein: 140, carbs: 200, fat: 60 },
  remaining: { kcal: 2000, protein: 140, carbs: 200, fat: 60 },
}) }));
vi.mock("@/lib/server/coach-context", () => ({ eatsForSuggestions: async () => ({ all: [], anchors: [] }) }));
const hit: FoodHit = { name: "Chicken breast, roasted", foodRefId: "resolved-ref", brand: null,
  kcalPer100g: 165, prefStatus: "eats", allergenTags: [] };
const profile = { avoid_allergens: [], avoid_food_ref_ids: [], banned_categories: [], custom_rules: [] };
function make(onFoodHits: (uid: string, hits: readonly FoodHit[]) => void) {
  return defaultPorts({} as never, {} as never, () => "id", { date: "2026-11-15", tz: "UTC" },
    { profile: profile as never, onFoodHits });
}

describe("the real suggestion port's own-food evidence boundary", () => {
  it("publishes the actual successful Eats lookup, before returning suggestions", async () => {
    state.hit = hit; state.failed = false;
    const onFoodHits = vi.fn();
    await make(onFoodHits).suggest("u1", { kind: "meal", count: 3 });
    expect(onFoodHits).toHaveBeenCalledWith("u1", [hit]);
  });
  it("publishes nothing when the own-food lookup fails", async () => {
    state.failed = true;
    const onFoodHits = vi.fn();
    await expect(make(onFoodHits).suggest("u1", { kind: "meal" })).rejects.toThrow("lookup failed");
    expect(onFoodHits).not.toHaveBeenCalled();
  });
});
