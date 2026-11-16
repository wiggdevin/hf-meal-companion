import { describe, expect, it } from "vitest";
import type { FoodHit } from "@/lib/coach/executors";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";
import { newModelState, scanReply } from "@/lib/server/coach-turn/model-state";
import type { TurnKit } from "@/lib/server/coach-turn/kit";
import type { OpenTurn } from "@/lib/server/coach-turn/types";

const REF = "3f1b1a2c-0000-4000-8000-000000000001";
const chicken: FoodHit = { name: "Chicken breast, roasted", foodRefId: REF, brand: null,
  kcalPer100g: 165, prefStatus: "eats", allergenTags: [], category: [], catalogFoodRevisionId: 12 };
const evidence = { [chicken.name]: { foodRefId: REF, allergenTags: [], category: [],
  onEatsList: true, onAvoidList: false, catalogFoodRevisionId: 12 } };
async function scan(foodEvidence = evidence, foodRefId = REF, blocked = false) {
  const kit = { profile: { ...EMPTY_PROFILE, avoid_allergens: ["fish"],
    avoid_food_ref_ids: blocked ? [REF] : [] }, foodEvidence,
    replyPorts: { searchFoods: async () => [], profileRules: async () => null } } as unknown as TurnKit;
  const turn = { userId: "u1", req: { text: "dinner?" }, replyDeadlineAt: Date.now() + 1000 } as OpenTurn;
  return scanReply(turn, kit, newModelState([], 0), blocked ? "Try Chicken breast, roasted." : "Choose an option.",
    [{ name: chicken.name, foodRefId }]).scan;
}

describe("server composition evidence reaches the reply guard", () => {
  it("keeps a card whose identity and facts were resolved by the server this turn", async () => {
    expect((await scan()).failing).toEqual([]);
  });
  it("waits for actual final-grounding hits before judging the held identity", async () => {
    const foodEvidence = {};
    let complete!: (value: { names: Set<string>; refs: Set<string> }) => void;
    const grounded = new Promise<{ names: Set<string>; refs: Set<string> }>((resolve) => { complete = resolve; });
    const kit = { profile: { ...EMPTY_PROFILE, avoid_allergens: ["fish"] }, foodEvidence,
      replyPorts: { searchFoods: async () => [], profileRules: async () => null } } as unknown as TurnKit;
    const turn = { userId: "u1", req: { text: "dinner?" }, replyDeadlineAt: Date.now() + 1000 } as OpenTurn;
    const result = scanReply(turn, kit, newModelState([], 0), "Choose an option.",
      [{ name: chicken.name, foodRefId: REF }], [], grounded).scan;
    Object.assign(foodEvidence, evidence);
    complete({ names: new Set(), refs: new Set() });
    expect((await result).failing).toEqual([]);
  });
  it("still holds a model ID that differs from the resolved food", async () => {
    expect((await scan(evidence, "3f1b1a2c-0000-4000-8000-000000000002")).failing)
      .toContainEqual(expect.objectContaining({ name: chicken.name, reason: "unchecked_id" }));
  });
  it("still holds a food whose search failed to return evidence", async () => {
    expect((await scan({})).failing).toContainEqual(expect.objectContaining({ name: chicken.name, reason: "unchecked_id" }));
  });
  it("applies the current Avoid policy to successfully resolved foods", async () => {
    const result = await scan(evidence, REF, true);
    expect(result.failing.some((item) => item.name === chicken.name && item.reason !== "unchecked_id")).toBe(true);
  });
});
