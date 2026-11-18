import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runTurn } from "@/tests/coach/fixtures/run-turn";

const ID = "3f1b1a2c-0000-4000-8000-000000000001";
const title = "Sourdough toast, bacon & eggs";
const read = { date: "2026-11-22", slots: [{ slot: "meal-4", label: "Meal 4", title,
  time: "08:00", state: "pending", items: ["75 g Bread, sourdough - 200 kcal",
    "75 g Bacon, pan-fried - 325 kcal", "75 g Eggs, cooked - 110 kcal"] }] };

function db() {
  return { from: (table: string) => {
    const data = table === "constraint_profiles" ? [{ avoid_allergens: ["gluten"],
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

const req = (text = "What's my breakfast a week from today?") => ({ threadId: null, messageId: ID,
  text, now: "2026-11-15T09:14:00Z", tz: "America/Los_Angeles" });
const poisonedFinal = { kind: "final", text: `On November 22, your breakfast is ${title}.`,
  suggestions: [{ name: "Bread, sourdough", grams: 75 }, { name: "Bacon, pan-fried", grams: 75 },
    { name: "Eggs, cooked", grams: 75 }] };
beforeEach(() => { vi.stubEnv("COACH_ENABLED", "1"); vi.stubEnv("TYPESAFE_API_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("completed request-bound saved plan", () => {
  it("reports the actual forbidden authored meal without asking the model for suggestion mirrors", async () => {
    const generate = vi.fn().mockResolvedValueOnce({ kind: "tool", calls: [{ name: "get_plan",
      args: { date: read.date } }] }).mockResolvedValueOnce(poisonedFinal);
    const result = await runTurn(db(), db(), "u", req(), { generate: generate as never,
      ports: { dayPlan: async () => read }, newId: () => ID, now: () => 0,
      replyCheck: { searchFoods: async () => [], profileRules: async () => null },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.messages.at(-1)?.content).toContain(title);
    expect(result.messages.at(-1)?.content).toContain("75 g Bread, sourdough");
    expect(result.messages.at(-1)?.content).toContain("Its foods were not re-checked against your current food rules.");
    expect(result.messages.at(-1)?.content).not.toContain("couldn’t check");
    expect(result.suggestions).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.composed).toEqual([]);
    expect(result.messages.at(-1)?.blocks ?? []).toEqual([]);
    expect(result.messages.at(-1)).not.toHaveProperty("memory");
  });

  it("does not append a saved-plan notice to a reask that replaced the factual report", async () => {
    // A read with no items must still use the ordinary guarded final path. This recreates
    // the R4 mirror hold after the existing authored-fact exemption has removed the prose.
    const generate = vi.fn().mockResolvedValueOnce({ kind: "tool", calls: [{ name: "get_plan",
      args: { date: read.date } }] }).mockResolvedValueOnce(poisonedFinal);
    const result = await runTurn(db(), db(), "u", req(), { generate: generate as never,
      ports: { dayPlan: async () => ({ ...read, slots: [{ ...read.slots[0], items: [] }] }) },
      newId: () => ID, now: () => 0,
      replyCheck: { searchFoods: async () => [], profileRules: async () => null },
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.messages.at(-1)?.content).toContain("couldn’t check");
    expect(result.messages.at(-1)?.content).not.toContain("That is what your saved plan says");
    expect(result.messages.at(-1)?.content).not.toContain("not re-checked");
    expect(result.suggestions).toEqual([]);
    expect(result.actions).toEqual([]);
  });

  it.each([{ planSource: { title: "Toast", ingredients: ["bread"] } }, { planSkipped: ["Toast"] }])(
    "keeps the model path for an attached plan context: %j", async (context) => {
      const generate = vi.fn().mockResolvedValueOnce({ kind: "tool", calls: [{ name: "get_plan",
        args: { date: read.date } }] }).mockResolvedValueOnce(poisonedFinal);
      const result = await runTurn(db(), db(), "u", { ...req(), surface: "plan", ...context }, {
        generate: generate as never, ports: { dayPlan: async () => read }, newId: () => ID, now: () => 0,
        replyCheck: { searchFoods: async () => [], profileRules: async () => null },
      });
      expect(generate).toHaveBeenCalledTimes(2);
      expect(result.suggestions).toEqual([]);
      expect(result.actions).toEqual([]);
      expect(result.messages.at(-1)?.content).not.toContain("That is what your saved plan says");
    });
});
