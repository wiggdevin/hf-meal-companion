import { describe, expect, it, vi } from "vitest";
import type { FoodHit } from "@/lib/coach/executors";
import { armTurn } from "@/lib/server/coach-turn/kit";
import { recordFoodHits } from "@/lib/server/coach-turn/food-evidence";
import type { EvidenceByName } from "@/lib/coach/policy";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";

const { observed } = vi.hoisted(() => ({ observed: { callback: undefined as
  undefined | ((userId: string, hits: readonly FoodHit[]) => void) } }));
vi.mock("@/lib/server/coach-ports", () => ({ defaultPorts: vi.fn((_c, _a, _n, _clock, opts) => {
  observed.callback = opts.onFoodHits;
  return { searchFoods: async () => [] };
}) }));
const food: FoodHit = { name: "Chicken breast, roasted", foodRefId: "resolved-ref", brand: null,
  kcalPer100g: 165, prefStatus: "eats", allergenTags: [], catalogFoodRevisionId: 12 };
function kit(searchFoods = async (): Promise<FoodHit[]> => [food]) {
  return armTurn({ userId: "u1", deps: { ports: { searchFoods } }, now: () => 0,
    req: {}, clock: {}, client: {}, admin: {}, newId: () => "id" } as never,
  { profile: EMPTY_PROFILE, instances: [] } as never);
}

describe("completed server food evidence ledger", () => {
  it("records the actual resolved identity and facts without inventing absent facts", () => {
    const evidence: EvidenceByName = {};
    recordFoodHits(evidence, [{ ...food, foodRefId: null }, food]);
    expect(evidence[food.name]).toMatchObject({ foodRefId: food.foodRefId,
      catalogFoodRevisionId: 12, allergenTags: [], onEatsList: true, category: null });
  });
  it("holds a normalized name with two real IDs and never clears it with a later hit", () => {
    const evidence: EvidenceByName = {};
    recordFoodHits(evidence, [food, { ...food, name: food.name.toLowerCase(),
      foodRefId: "other-ref", prefStatus: "avoid" }]);
    recordFoodHits(evidence, [food]);
    expect(Object.values(evidence).every((entry) => entry.foodRefId === null)).toBe(true);
    expect(Object.values(evidence).every((entry) => entry.onAvoidList === true)).toBe(true);
  });
  it("captures a successful injected search for this account", async () => {
    const turn = kit();
    await turn.turnPorts.searchFoods("u1", "chicken", 3);
    expect(turn.foodEvidence[food.name]?.foodRefId).toBe(food.foodRefId);
  });
  it("passive reply-check lookups never turn a model-only card into active-tool evidence", async () => {
    const turn = kit();
    await turn.replyPorts.searchFoods("u1", "chicken", 3);
    expect(turn.foodEvidence).toEqual({});
  });
  it("a failed search contributes no evidence", async () => {
    const turn = kit(async () => { throw new Error("unavailable"); });
    await expect(turn.turnPorts.searchFoods("u1", "chicken", 3)).rejects.toThrow("unavailable");
    expect(turn.foodEvidence).toEqual({});
  });
  it("a different account's search contributes no evidence", async () => {
    const turn = kit();
    await turn.turnPorts.searchFoods("other", "chicken", 3);
    expect(turn.foodEvidence).toEqual({});
  });
  it("aborted turns discard late search results", async () => {
    let finish!: (hits: FoodHit[]) => void;
    const turn = kit(() => new Promise((resolve) => { finish = resolve; }));
    const pending = turn.turnPorts.searchFoods("u1", "chicken", 3);
    turn.turnAbort.abort(); finish([food]); await pending;
    expect(turn.foodEvidence).toEqual({});
  });
  it("the server's own-food callback captures verified Eats lookup results", () => {
    const turn = kit();
    observed.callback!("u1", [food]);
    expect(turn.foodEvidence[food.name]?.foodRefId).toBe(food.foodRefId);
  });
});
