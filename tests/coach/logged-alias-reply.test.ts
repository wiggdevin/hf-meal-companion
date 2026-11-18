import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachAction } from "@/lib/coach/actions";
import type { FoodHit } from "@/lib/coach/executors";
import { withoutLogConfirmations } from "@/lib/coach/log-confirmation";

const policy = vi.hoisted(() => ({ grounded: [] as CoachAction[] }));
vi.mock("@/lib/server/coach-role-advice", () => ({
  applyGroundedActionPolicies: async (_admin: unknown, _uid: string, actions: CoachAction[]) => {
    policy.grounded = actions;
    return { actions, logNotices: [], recipeRefusals: [] };
  },
}));
const { runTurn } = await import("@/tests/coach/fixtures/run-turn");

beforeEach(() => {
  vi.stubEnv("COACH_ENABLED", "1");
  vi.stubEnv("TYPESAFE_API_KEY", "");
  policy.grounded = [];
});
afterEach(() => { vi.unstubAllEnvs(); });

function db(tables: Record<string, unknown[]> = {}) {
  return { from: (table: string) => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain, eq: () => chain, neq: () => chain, lte: () => chain, ilike: () => chain,
      in: () => chain, is: () => chain, gte: () => chain, gt: () => chain, lt: () => chain,
      order: () => chain, limit: () => chain, range: () => chain,
      insert: () => chain, update: () => chain,
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      single: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve),
    });
    return chain;
  }, rpc: async () => ({ data: [], error: null }) } as never;
}

const REF = (n: number) => `3f1b1a2c-0000-4000-8000-00000000000${n}`;
const hit = (name: string, n: number, tags: string[]): FoodHit => ({
  name, foodRefId: REF(n), catalogFoodRevisionId: n, brand: null,
  kcalPer100g: 100, proteinPer100g: 10, carbsPer100g: 10, fatPer100g: 2,
  prefStatus: "eats", allergenTags: tags, category: [],
  checkedAllergens: ["gluten", "dairy"],
});

async function loggedTurn(input: {
  name: string; grams: number; text: string; allergens: string[];
  grounded: FoodHit; scanHit: FoodHit;
}) {
  const generate = vi.fn().mockResolvedValueOnce({ kind: "final", text: input.text,
    actions: [{ kind: "log_meal", date: "2026-11-15", slot: "meal-2", title: input.name,
      at: "12:00", items: [{ name: input.name, grams: input.grams }] }] });
  return runTurn(db({ constraint_profiles: [{ avoid_allergens: input.allergens,
    avoid_food_ref_ids: [], banned_categories: [], custom_rules: [] }] }), db(), "u1", {
    threadId: null, messageId: REF(9), text: `log ${input.grams} g of ${input.name}`,
  }, {
    generate: generate as never, now: () => 0, newId: () => REF(8),
    ports: { searchFoods: async () => [input.grounded] },
    replyCheck: { searchFoods: async () => [input.scanHit], profileRules: async () => null },
  });
}

describe("already-eaten logs survive catalog aliases in confirmation prose", () => {
  it("keeps a grounded forbidden-food log when the lexicon resolves its generic noun to another row", async () => {
    const result = await loggedTurn({ name: "Smoked tofu", grams: 100,
      text: "Logged 100 g of smoked tofu for lunch.", allergens: ["soy"],
      grounded: hit("Smoked tofu", 1, ["soy"]), scanHit: hit("Tofu, firm", 2, ["soy"]) });
    // The model emitted it and grounding kept it, marked off-plan, before the reply guard ran.
    expect(policy.grounded).toMatchObject([{ kind: "log_meal", flagged: ["Smoked tofu"],
      items: [{ name: "Smoked tofu", grams: 100, foodRefId: REF(1), verdict: "blocked" }] }]);
    expect(result.actions).toHaveLength(1);
  });

  it("keeps a quantified 1 g log when prose uses white rice and the catalog uses Rice, white, cooked", async () => {
    const rice = hit("Rice, white, cooked", 3, []);
    const result = await loggedTurn({ name: rice.name, grams: 1,
      text: "Logged 1 g of white rice.", allergens: ["gluten", "dairy"],
      grounded: rice, scanHit: rice });
    expect(policy.grounded).toMatchObject([{ kind: "log_meal",
      items: [{ name: rice.name, grams: 1, foodRefId: REF(3), verdict: "allowed" }] }]);
    expect(result.actions).toHaveLength(1);
  });

  it("still scans separate advice after the grounded log confirmation", async () => {
    const result = await loggedTurn({ name: "Smoked tofu", grams: 100,
      text: "Logged 100 g of smoked tofu for lunch. Try tofu for dinner.", allergens: ["soy"],
      grounded: hit("Smoked tofu", 1, ["soy"]), scanHit: hit("Tofu, firm", 2, ["soy"]) });
    expect(policy.grounded).toHaveLength(1);
    expect(result.actions).toMatchObject([{ kind: "log_meal", slot: "meal-2", at: "12:00",
      items: [{ foodRefId: REF(1), grams: 100 }] }]);
    expect(result.messages.at(-1)?.content).not.toContain("Try tofu");
  });

  it("still scans separate advice about the exact same grounded food and ref", async () => {
    const tofu = hit("Tofu", 1, ["soy"]);
    const result = await loggedTurn({ name: tofu.name, grams: 100,
      text: "Logged 100 g tofu for lunch. Try tofu for dinner.", allergens: ["soy"],
      grounded: tofu, scanHit: tofu });
    expect(policy.grounded).toHaveLength(1);
    expect(result.actions).toMatchObject([{ kind: "log_meal", slot: "meal-2", at: "12:00",
      items: [{ foodRefId: REF(1), grams: 100 }] }]);
    expect(result.messages.at(-1)?.content).not.toContain("Try tofu");
  });

  it("does not falsely confirm an ungroundable list mark when the reply ends in a question", async () => {
    const generate = vi.fn().mockResolvedValueOnce({ kind: "final",
      text: "Added tofu to your Favored list. Anything else?",
      actions: [{ kind: "add_to_eats", name: "tofu" }] });
    const result = await runTurn(db(), db(), "u1", {
      threadId: null, messageId: REF(9), text: "add tofu to my eats list",
    }, { generate: generate as never, now: () => 0, newId: () => REF(8),
      ports: { searchFoods: async () => [] },
      replyCheck: { searchFoods: async () => [], profileRules: async () => null },
    });
    expect(result.actions).toEqual([]);
    expect(result.messages.at(-1)?.content).not.toContain("Added tofu");
  });

  it.each(["Tofu is on your Avoid list now. Anything else?",
    "Tofu is no longer on your Avoid list. Anything else?"])(
    "shows the failed grounding clarification instead of a false list-state claim: %s", async (text) => {
      const generate = vi.fn().mockResolvedValue({ kind: "final", text,
        actions: [{ kind: "add_to_avoid", name: "Tofu" }] });
      const result = await runTurn(db(), db(), "u1", {
        threadId: null, messageId: REF(9), text: "add tofu to my avoid list",
      }, { generate: generate as never, now: () => 0, newId: () => REF(8),
        ports: { searchFoods: async () => [] },
        replyCheck: { searchFoods: async () => [], profileRules: async () => null },
      });
      expect(result.actions).toEqual([]);
      expect(result.messages.at(-1)?.content).toContain("could not find");
      expect(result.messages.at(-1)?.content).not.toContain("is on your Avoid");
      expect(result.messages.at(-1)?.content).not.toContain("no longer");
    });

  it("does not claim an Avoid removal beside an actual grounded Avoid addition", async () => {
    const generate = vi.fn().mockResolvedValueOnce({ kind: "final",
      text: "Tofu is no longer on your Avoid list.", actions: [{ kind: "add_to_avoid", name: "Tofu" }] });
    const result = await runTurn(db(), db(), "u1", { threadId: null, messageId: REF(9),
      text: "add tofu to my avoid list" }, { generate: generate as never, now: () => 0,
      newId: () => REF(8), ports: { searchFoods: async () => [hit("Tofu", 1, [])] },
      replyCheck: { searchFoods: async () => [], profileRules: async () => null } });
    expect(result.actions[0]?.kind).toBe("add_to_avoid");
    expect(result.messages.at(-1)?.content).not.toContain("no longer");
  });
});

describe("log confirmation exemption stays bound to completed identity and quantity", () => {
  const item = { name: "Rice, white, cooked", foodRefId: REF(3), grams: 1 };
  const evidence = { [item.name]: { foodRefId: REF(3), allergenTags: [], category: [],
    onEatsList: true, onAvoidList: false } };
  const text = "Logged 1 g of white rice.";

  it("exempts nothing without a grounded log or a completed matching lookup", () => {
    expect(withoutLogConfirmations(text, [], evidence)).toBe(text);
    expect(withoutLogConfirmations(text, [item], {})).toBe(text);
    expect(withoutLogConfirmations(text, [{ ...item, foodRefId: REF(4) }], evidence)).toBe(text);
  });

  it.each(["Logged 2 g of white rice.", "Logged 1 g of shrimp.",
    "Logged 1 g of white rice and try shrimp.", "Logged 1 g of white rice, then have tofu."])(
    "leaves unmatched food, quantity and advice in the scan: %s", (sentence) => {
      expect(withoutLogConfirmations(sentence, [item], evidence)).toBe(sentence);
    });

  it("never treats a clause hidden in a model-written food name as confirmation", () => {
    const sentence = "Logged 1 g of rice then try shrimp.";
    expect(withoutLogConfirmations(sentence, [{ ...item, name: "rice then try shrimp" }], evidence))
      .toBe(sentence);
  });

  it("accepts a verified catalog name containing a percentage", () => {
    const milk = { name: "Milk, 2%", foodRefId: REF(4), grams: 250 };
    const facts = { [milk.name]: { ...evidence[item.name], foodRefId: milk.foodRefId } };
    expect(withoutLogConfirmations("Logged 250 g of 2% milk.", [milk], facts)).toBe("");
  });

  it("never accepts extra food words supplied only by the model's item name", () => {
    const supplied = { name: "rice with shrimp", foodRefId: REF(3), grams: 1 };
    const sentence = "Logged 1 g of rice with shrimp.";
    expect(withoutLogConfirmations(sentence, [supplied], evidence)).toBe(sentence);
  });

  it("accepts a complete long name read from the matched catalog identity", () => {
    const food = { name: "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
      foodRefId: REF(5), grams: 100 };
    const facts = { [food.name]: { ...evidence[item.name], foodRefId: food.foodRefId } };
    expect(withoutLogConfirmations(`Logged 100 g of ${food.name}.`, [food], facts)).toBe("");
  });

  it("never binds a missing or empty food ref", () => {
    const supplied = { name: "Rice", foodRefId: "", grams: 1 };
    const facts = { Rice: { ...evidence[item.name], foodRefId: "" } };
    const sentence = "Logged 1 g of rice.";
    expect(withoutLogConfirmations(sentence, [supplied], facts)).toBe(sentence);
  });

  it("binds a meal label to actual occasion, never a fixed numbered-slot assumption", () => {
    const known = { ...item, slot: "meal-4", occasion: "lunch" };
    expect(withoutLogConfirmations("Logged 1 g of white rice for lunch.", [known], evidence)).toBe("");
    const wrong = "Logged 1 g of white rice for dinner.";
    expect(withoutLogConfirmations(wrong, [known], evidence)).toBe(wrong);
    const ambiguous = "Logged 1 g of white rice for lunch.";
    expect(withoutLogConfirmations(ambiguous, [{ ...item, slot: "meal-2" }], evidence)).toBe(ambiguous);
  });

  it("binds multiple quantified items only when each has its own grounded amount and identity", () => {
    const tofu = { name: "Tofu", foodRefId: REF(4), grams: 100, occasion: "lunch" };
    const rice = { ...item, grams: 150, occasion: "lunch" };
    const facts = { ...evidence, Tofu: { ...evidence[item.name], foodRefId: REF(4) } };
    const sentence = "Logged 100 g tofu and 150 g white rice for lunch.";
    expect(withoutLogConfirmations(sentence, [tofu, rice], facts)).toBe("");
    expect(withoutLogConfirmations(sentence, [tofu], facts)).toBe(sentence);
  });
});
