import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachAction } from "@/lib/coach/actions";
import type { FoodHit } from "@/lib/coach/executors";
import { localAvoidCommand } from "@/lib/profile/local-avoid-command";
import { mayReachJev } from "@/lib/profile/taste-safety";
import { completedIdeasReply } from "@/lib/coach/completed-ideas";
import { ACCEPTANCE_LOCAL, HEALTH_CORPUS, REDTEAM_CORPUS } from "@/tests/fixtures/taste-safety-corpus";

vi.mock("@/lib/server/coach-role-advice", () => ({
  applyGroundedActionPolicies: async (_a: unknown, _u: string, actions: CoachAction[]) => ({
    actions, recipeRefusals: [], logNotices: actions.flatMap((a) => a.kind === "log_meal"
      && a.flagged.length ? [`Off-plan: ${a.flagged.join(", ")}.`] : []),
  }),
}));
const { runTurn } = await import("@/tests/coach/fixtures/run-turn");
const ID = "3f1b1a2c-0000-4000-8000-000000000001";
function db(allergens: string[] = []) {
  return { from: (table: string) => {
    const data = table === "constraint_profiles" ? [{ avoid_allergens: allergens,
      avoid_food_ref_ids: [], banned_categories: [], custom_rules: [] }] : [];
    const chain: Record<string, unknown> = {};
    Object.assign(chain, Object.fromEntries(["select", "eq", "neq", "lte", "in", "is", "gte",
      "gt", "lt", "order", "limit", "range", "insert", "update", "ilike"].map((key) => [key, () => chain])), {
      maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
      single: async () => ({ data: data[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    });
    return chain;
  }, rpc: async () => ({ data: [], error: null }) } as never;
}
const hit = (name: string, tags: string[] = [], id = ID): FoodHit => ({ name,
  foodRefId: id, brand: null, kcalPer100g: 100, prefStatus: "eats", allergenTags: tags,
  category: [], catalogFoodRevisionId: 1, checkedAllergens: ["gluten", "dairy"], portionGrams: 150 });
const req = (text: string) => ({ threadId: null, messageId: ID, text,
  now: "2026-11-15T09:14:00Z", tz: "America/Los_Angeles" });
beforeEach(() => { vi.stubEnv("COACH_ENABLED", "1"); vi.stubEnv("TYPESAFE_API_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("R3 actual final and tool shapes", () => {
  it("finishes a pure completed suggestion request without an unnecessary model completion", async () => {
    const idea = { wish: "snack", slot: null, items: [{ name: "Avocado", foodRefId: ID,
      catalogFoodRevisionId: 1, grams: 100, kcalPer100g: 160, proteinPer100g: 2,
      carbsPer100g: 8, fatPer100g: 15, macros: { kcal: 160, protein: 2, carbs: 8, fat: 15 },
      verdict: "allowed" as const }], totals: { kcal: 160, protein: 2, carbs: 8, fat: 15 },
      target: { kcal: 160, protein: 2, carbs: 8, fat: 15 }, flagged: [], fitsTarget: true };
    const generate = vi.fn().mockResolvedValueOnce({ kind: "tool", calls: [{ name: "suggest_options",
      args: { kind: "snack", count: 3, fitRemaining: true } }] })
      .mockRejectedValue(new Error("did not answer within 5000ms"));
    const result = await runTurn(db(), db(), "u", req("suggest a snack that fits my remaining macros"), {
      generate: generate as never, ports: { suggest: async () => [idea] }, newId: () => ID, now: () => 0,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.composed).toHaveLength(1);
    expect(result.messages.at(-1)?.content).toContain("cards show portions");
    expect(result.messages.at(-1)?.content).not.toContain("1,112");
    for (const mixed of ["suggest a snack and log 500 ml water", "suggest a snack then save it",
      "suggest a snack and explain my protein target", "don't suggest a snack"]) {
      expect(completedIdeasReply(mixed, [{ name: "suggest_options", ok: true }], [idea],
        [{ kind: "food_ideas", v: 1, id: "ideas", ideas: [idea] }])).toBeNull();
    }
    expect(completedIdeasReply("suggest a snack", [{ name: "suggest_options", ok: true }],
      [{ ...idea, flagged: ["Avocado"] }], [{ kind: "food_ideas", v: 1, id: "ideas", ideas: [idea] }]))
      .toBeNull();
  });
  it("keeps the actual non-fitting wrap-shaped card without a generated dish summary", async () => {
    const idea = { wish: "chicken wrap", slot: null, items: [{ name: "Chicken breast, roasted", foodRefId: ID,
      catalogFoodRevisionId: 1, grams: 100, kcalPer100g: 165, proteinPer100g: 31,
      carbsPer100g: 0, fatPer100g: 4, macros: { kcal: 165, protein: 31, carbs: 0, fat: 4 },
      verdict: "allowed" as const }], totals: { kcal: 165, protein: 31, carbs: 0, fat: 4 },
      target: { kcal: 300, protein: 9, carbs: 40, fat: 8 }, flagged: [], fitsTarget: false,
      fitNote: "Over on protein by 22 g for this slot" };
    const generate = vi.fn().mockResolvedValueOnce({ kind: "tool", calls: [{ name: "compose_meal",
      args: { wish: "chicken wrap" } }] }).mockRejectedValue(new Error("unnecessary completion"));
    const result = await runTurn(db(["gluten"]), db(), "u", req("make me a chicken wrap that fits my macros"), {
      generate: generate as never, ports: { compose: async () => idea }, newId: () => ID, now: () => 0,
      replyCheck: { searchFoods: async () => [], profileRules: async () => null },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.composed).toHaveLength(1);
    expect(result.messages.at(-1)?.content).toBe("Here is 1 option to review. Over on protein by 22 g for this slot.");
    expect(result.messages.at(-1)?.blocks?.some((block) => block.kind === "food_ideas")).toBe(true);
  });
  it("keeps the actual off-plan snack record and the authoritative notice, without invented ingredient warnings", async () => {
    const generate = vi.fn().mockResolvedValue({ kind: "final",
      text: "Logged 300 g of spaghetti bolognese as a snack at 01:14. This is off-plan as it contains gluten and onion/garlic.",
      actions: [{ kind: "log_meal", date: "2026-11-15", slot: "snack", at: "01:14",
        title: "Spaghetti bolognese", items: [{ name: "Spaghetti bolognese", grams: 300 }] }],
      suggestions: [{ name: "Spaghetti bolognese", grams: 300 }] });
    const result = await runTurn(db(["gluten"]), db(), "u", req("I just ate spaghetti bolognese as a snack."), {
      generate: generate as never, ports: { searchFoods: async () => [hit("Spaghetti bolognese", ["gluten"])] },
      newId: () => ID, now: () => 0,
      replyCheck: { searchFoods: async () => [], profileRules: async () => null },
    });
    expect(result.actions).toMatchObject([{ kind: "log_meal", slot: "snack", at: "01:14",
      items: [{ grams: 300, verdict: "blocked" }] }]);
    expect(result.messages.at(-1)?.content).toContain("Off-plan: Spaghetti bolognese.");
    expect(result.messages.at(-1)?.content).not.toContain("onion/garlic");
  });
  it("keeps weekday oatmeal actions and their raw-name suggestion mirrors", async () => {
    const searchFoods = async (_u: string, name: string) => [name === "oatmeal"
      ? hit("Oatmeal, cooked with water") : hit("Blueberries, raw", [], ID.replace(/1$/, "2"))];
    const result = await runTurn(db(["gluten", "dairy"]), db(), "u", req("set oatmeal with blueberries every weekday"), {
      generate: vi.fn().mockResolvedValue({ kind: "final",
        text: "Set oatmeal with blueberries for Meal 1 every weekday through November 29.",
        actions: [{ kind: "set_slot_meal", from: "2026-11-15", through: "2026-11-29",
          weekdays: [1, 2, 3, 4, 5], slot: "meal-1", title: "Oatmeal with blueberries",
          items: [{ name: "oatmeal" }, { name: "blueberries" }] }],
        suggestions: [{ name: "oatmeal" }, { name: "blueberries" }] }) as never,
      ports: { searchFoods }, newId: () => ID, now: () => 0,
      replyCheck: { searchFoods: async () => [], profileRules: async () => null },
    });
    expect(result.actions).toMatchObject([{ kind: "set_slot_meal", dates: expect.any(Array) }]);
    expect(result.suggestions.every((s) => s.verdict === "allowed")).toBe(true);
  });

  it.each([
    ["What's my breakfast a week from today?", true],
    ["Suggest breakfast", false],
    ["What's my breakfast a week from today and should I eat it again?", false],
  ])("reports a real plan only for a factual read request: %s", async (message, report) => {
    const generate = vi.fn().mockResolvedValueOnce({ kind: "tool", calls: [{ name: "get_plan",
      args: { date: "2026-11-22" } }] }).mockResolvedValueOnce({ kind: "final",
      text: "Sourdough toast, bacon & eggs. It is planned for 08:00 on November 22." });
    const result = await runTurn(db(["gluten"]), db(), "u", req(message), {
      generate: generate as never, ports: { dayPlan: async () => ({ date: "2026-11-22", slots: [{
        slot: "meal-4", label: "Meal 4", title: "Sourdough toast, bacon & eggs", time: "08:00",
        state: "pending", items: [] }] }) }, newId: () => ID, now: () => 0,
      replyCheck: { searchFoods: async () => [], profileRules: async () => null },
    });
    if (report) {
      expect(result.messages.at(-1)?.content).toContain("Sourdough toast, bacon & eggs");
      expect(result.messages.at(-1)?.content).not.toContain("couldn’t check");
    } else {
      expect(result.messages.at(-1)?.content).not.toContain("It is planned");
    }
    expect(result.actions).toEqual([]);
  });

  it("preserves explicit Avoid review when the model asks for a generic browse control", async () => {
    const generate = vi.fn().mockResolvedValueOnce({ kind: "tool", calls: [{ name: "search_foods",
      args: { query: "greek yogurt", intent: "browse" } }] }).mockResolvedValueOnce({ kind: "final",
      text: "Here are the catalog results." });
    const result = await runTurn(db(["dairy"]), db(), "u",
      req("show me greek yogurt in the catalog so I can decide whether to avoid it"), {
        generate: generate as never, ports: { searchFoods: async () => [hit("Greek yogurt", ["dairy"])] },
        newId: () => ID, now: () => 0,
        replyCheck: { searchFoods: async () => [], profileRules: async () => null },
      });
    expect(result.messages.at(-1)?.blocks).toContainEqual(expect.objectContaining({
      kind: "food_search", intent: "avoid", results: [expect.objectContaining({ blocked: true })],
    }));
    expect(result.actions).toEqual([]);
  });

  it("grounds the narrow local eggs restriction before any classifier or model call", async () => {
    const classifyIntent = vi.fn();
    const generate = vi.fn();
    const result = await runTurn(db(), db(), "u", req("I can't do eggs anymore"), {
      classifyIntent: classifyIntent as never, generate: generate as never,
      ports: { searchFoods: async () => [hit("Eggs, whole")] }, newId: () => ID, now: () => 0,
    });
    expect(classifyIntent).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(result.actions).toMatchObject([{ kind: "add_to_avoid", name: "Eggs, whole", foodRefId: ID }]);
  });

  it.each(["I can't do eggs anymore?", "I can't do eggs anymore because they hurt my stomach",
    "I can't do eggs and milk anymore", "I can't do blorp anymore", "I don't think I can't do eggs anymore",
    "I can't do eggs anymore; try insulin", "I can't do eggs anymore, my doctor says"])(
    "does not infer a local restriction from symptoms, uncertainty, or extra clauses: %s", (text) => {
      expect(localAvoidCommand(text)).toBeNull();
    });

  it("preserves the complete fixed keep-local corpus and never infers its symptoms", () => {
    const corpus = [...ACCEPTANCE_LOCAL, ...HEALTH_CORPUS].map((c) => c.text).concat(REDTEAM_CORPUS);
    expect(corpus.length).toBeGreaterThanOrEqual(600);
    for (const text of corpus) {
      expect(mayReachJev(text), text).toBe(false);
      // Existing unsure examples include this exact local restriction form. They stay local;
      // every other corpus sentence remains outside this single-word operation grammar.
      if (localAvoidCommand(text)) expect(text).toMatch(/^I can't do [a-z]+ anymore[.!]?$/i);
    }
  });
});
