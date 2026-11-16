import { describe, expect, it } from "vitest";
import { foodEvidenceFor, recordFoodEvidence } from "@/lib/coach/food-evidence";
import { startReplyScan } from "@/lib/server/reply-check";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";
import type { EvidenceByName } from "@/lib/coach/policy";
import type { FoodHit } from "@/lib/coach/executors";
import { checkReply } from "@/lib/coach/reply-check";

const REF = "3f1b1a2c-0000-4000-8000-000000000001";
const entry = (id = REF, tags: string[] = []): EvidenceByName[string] => ({
  foodRefId: id, allergenTags: tags, category: [], onEatsList: true, onAvoidList: false,
  catalogFoodRevisionId: 1,
});
const hit = (name: string, id = REF, tags: string[] = []): FoodHit => ({
  name, foodRefId: id, brand: null, kcalPer100g: 100, prefStatus: "eats",
  allergenTags: tags, category: [], catalogFoodRevisionId: 1,
});
const profile = { ...EMPTY_PROFILE, avoid_allergens: ["gluten"] };
const scan = (text: string, evidence: EvidenceByName, hits: FoodHit[] = []) =>
  startReplyScan({ userId: "u", text, named: [], evidence, profile }, {
    searchFoods: async () => hits, profileRules: async () => null,
  }, Date.now() + 1000);

describe("consolidated reply identity boundaries", () => {
  it.each(["breaded chicken", "fried chicken", "raw chicken", "chicken parmesan",
    "soy chicken", "chicken nuggets"])("does not judge %s as plain roasted chicken", async (food) => {
      const result = await scan(`Try ${food} for dinner.`, { "Chicken breast, roasted": entry() },
        [hit("Chicken breast, roasted")]);
      expect(result.failing.length).toBeGreaterThan(0);
    });

  it("does not judge raw white rice as cooked white rice", async () => {
    expect((await scan("Try raw white rice.", { "Rice, white, cooked": entry() },
      [hit("Rice, white, cooked")])).failing.length).toBeGreaterThan(0);
  });

  it.each(["chicken", "roasted chicken"])("keeps the actual compatible chicken phrase: %s", async (food) => {
    expect((await scan(`Try ${food}.`, { "Chicken breast, roasted": entry() })).failing).toEqual([]);
  });

  it("judges plural held names instead of silently dropping them", async () => {
    const result = await startReplyScan({ userId: "u", text: "Have eggs for breakfast.", named: [],
      evidence: { "Eggs, whole": entry(REF, ["egg"]) },
      profile: { ...EMPTY_PROFILE, avoid_food_ref_ids: [REF] } }, {
      searchFoods: async () => [], profileRules: async () => null,
    }, Date.now() + 1000);
    expect(result.failing).toContainEqual(expect.objectContaining({ reason: expect.any(String) }));
    expect(foodEvidenceFor({ "Eggs, whole": entry() }, "egg")?.foodRefId).toBe(REF);
  });

  it("also checks canonical aliases in the pure check when no live scan is supplied", () => {
    const result = checkReply({ text: "Try tofu.", named: [], draft: null, actions: [],
      evidence: { "Tofu, firm": { ...entry(), onAvoidList: true } }, profile: EMPTY_PROFILE });
    expect(result.content).not.toContain("Try tofu");
    expect(result.textChecks).toMatchObject([{ verdict: "blocked", reason: "avoid_list" }]);
  });

  it.each([["Bread, gluten-free", "bread"], ["Milk, lactose-free", "milk"],
    ["Nuts, coconut milk, canned", "nuts"], ["Beverages, almond milk, unsweetened", "beverages"]])(
    "does not drop the safety qualifier or taxonomy subject: %s -> %s", (label, generic) => {
      expect(foodEvidenceFor({ [label]: entry() }, generic)).toBeUndefined();
    });

  it("retains full free-from names and ordinary catalog heads", () => {
    expect(foodEvidenceFor({ "Bread, gluten-free": entry() }, "gluten-free bread")?.foodRefId).toBe(REF);
    expect(foodEvidenceFor({ "Milk, 2%": entry() }, "milk")?.foodRefId).toBe(REF);
    expect(foodEvidenceFor({ "Rice, white, cooked": entry() }, "rice")?.foodRefId).toBe(REF);
  });

  it.each([false, true])("checks every generic matching ref independent of result order: reversed=%s", async (reverse) => {
    const hits = [hit("Chicken breast, roasted"), hit("Chicken breast, breaded", "breaded", ["gluten"])];
    if (reverse) hits.reverse();
    expect((await scan("Try chicken.", {}, hits)).failing.length).toBeGreaterThan(0);
  });

  it("allows multiple policy-clean matches without publishing a selected identity", async () => {
    const held = {};
    expect((await scan("Try chicken.", held,
      [hit("Chicken breast, roasted"), hit("Chicken thigh, grilled", "grilled")])).failing).toEqual([]);
    expect(held).toEqual({});
  });

  it.each(["sweep", "shopping"] as const)("checks every matching ref in the %s branch", async (branch) => {
    for (const reversed of [false, true]) {
      const hits = [hit("Zorbofruit"), hit("Zorbofruit", "other", ["gluten"])];
      if (reversed) hits.reverse();
      const result = await startReplyScan({ userId: "u", text: branch === "sweep" ? "Try zorbofruit." : "Done.",
        named: [], evidence: {}, profile,
        ...(branch === "shopping" ? { pendingActions: [{ kind: "add_to_shopping_list", names: ["zorbofruit"] }] } : {}),
      }, { searchFoods: async () => hits, profileRules: async () => null }, Date.now() + 1000);
      expect(result.failing).toContainEqual(expect.objectContaining({ reason: "allergen:gluten" }));
    }
  });

  it.each(["tags", "revision"])("holds conflicting same-ref %s, with Avoid sticky", (conflict) => {
    const held = { Tofu: { ...entry(REF, ["soy"]), onAvoidList: true } };
    recordFoodEvidence(held, "tofu", conflict === "tags" ? entry()
      : { ...entry(REF, ["soy"]), catalogFoodRevisionId: 2 });
    expect(foodEvidenceFor(held, "TOFU")).toMatchObject({
      foodRefId: null, allergenTags: null, ambiguous: true, onAvoidList: true,
    });
  });

  it("still merges identical facts for the same real ref", () => {
    const held = { Tofu: entry(REF, ["soy"]) };
    recordFoodEvidence(held, "TOFU", entry(REF, ["soy"]));
    expect(foodEvidenceFor(held, "tofu")?.foodRefId).toBe(REF);
  });

  it.each([true, false])("fails closed on an Avoid-only timed-out scan: metadata=%s", async (metadata) => {
    const result = await startReplyScan({ userId: "u", text: "Try tofu and chicken.", named: [], profile: EMPTY_PROFILE,
      evidence: metadata ? {} : { Tofu: { ...entry(), onAvoidList: true } } }, {
      ...(metadata ? { hasAvoidFoods: async () => true } : {}),
      searchFoods: () => new Promise(() => {}),
    }, Date.now() + 5);
    expect(result).toMatchObject({ hardRulesActive: true, complete: false });
  });
});
