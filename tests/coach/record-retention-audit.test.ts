import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groundActions } from "@/lib/coach/ground";
import { markLoggedActions } from "@/lib/coach/log-policy";
import { withoutLogConfirmations } from "@/lib/coach/log-confirmation";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";
import { newModelState } from "@/lib/server/coach-turn/model-state";
import { modelReply } from "@/lib/server/coach-turn/reply";
import { startReplyScan } from "@/lib/server/reply-check";
import type { CoachActionInput } from "@/lib/coach/actions";
import { retainRequestedLogs } from "@/lib/coach/retain-logs";
import { projectLogText } from "@/lib/coach/log-confirmation";

const REF = "3f1b1a2c-0000-4000-8000-000000000001";
const profile = { ...EMPTY_PROFILE, avoid_allergens: ["soy"] };
const hit = { foodRefId: REF, name: "Tofu", brand: null, kcalPer100g: 100,
  proteinPer100g: 10, carbsPer100g: 5, fatPer100g: 5, prefStatus: "eats" as const,
  allergenTags: ["soy"], category: [], catalogFoodRevisionId: 1 };
const evidence = { Tofu: { foodRefId: REF, allergenTags: ["soy"], category: [],
  onEatsList: true, onAvoidList: false, catalogFoodRevisionId: 1 } };
beforeEach(() => vi.stubEnv("TYPESAFE_API_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

async function reply(text: string, status: "ready" | "unavailable", request = "log 100 g tofu for lunch",
  grams = 100, slot: "meal-2" | "snack" = "meal-2") {
  const input: CoachActionInput = { kind: "log_meal", date: "2026-11-15", slot,
    at: "12:00", title: "Tofu", items: [{ name: "Tofu", grams }] };
  const grounded = await groundActions("u", [input], profile, {
    searchFoods: async () => [hit], newActionId: () => REF,
  });
  const marked = await markLoggedActions("u", grounded.actions, profile, { evidence: {
    status, preferenceFlags: [], byIdentity: { [`ref:${REF}`]: {
      foodName: "Tofu", allergenTags: ["soy"], policyCategories: [], facets: {}, noCook: null,
      onEatsList: true, onAvoidList: false, role: null,
    } },
  } });
  const state = newModelState([], 0);
  state.step = { kind: "final", text, actions: [input] };
  state.actions = marked.actions;
  state.logPolicyNotices = marked.notices;
  state.evidence = evidence;
  state.replyScan = { text, scan: startReplyScan({ userId: "u", text, named: [], evidence,
    profile, actions: marked.actions }, {
    searchFoods: async () => [hit], profileRules: async () => null,
  }, Date.now() + 1000) };
  const turn = { req: { text: request }, newId: () => REF, userId: "u", client: {},
    replyDeadlineAt: Date.now() + 1000,
    clock: { date: "2026-11-15", now: "2026-11-15T12:00:00Z", tz: "UTC" },
  } as never;
  const kit = { profile, profileInstances: [], foodEvidence: evidence,
    logEntryExists: async () => true, turnAbort: new AbortController() } as never;
  return { result: await modelReply(turn, kit, { context: null } as never, state,
    { history: { summary: null }, intentMs: 0, intentResult: null } as never), marked };
}

describe("real policy marking, warning projection and authorized record retention", () => {
  it.each(["as", "because"])("keeps benign %s warning semantics when evidence is unavailable", async (connector) => {
    const { result, marked } = await reply(`Logged 100 g tofu for lunch. This food is off-plan ${connector} it contains soy.`, "unavailable");
    expect(marked.notices).toEqual(["Off-plan: Tofu."]);
    expect(result.body.actions).toHaveLength(1);
    expect(result.content).toContain("Off-plan: Tofu.");
  });

  it.each(["ready", "unavailable"] as const)("retains only the requested record and never delivers warning-shaped advice: %s", async (status) => {
    const { result } = await reply("Logged 100 g tofu for lunch. This food is off-plan as it contains tofu recommended for dinner.", status);
    expect(result.content).not.toContain("recommended for dinner");
    expect(result.body.actions).toMatchObject([{ kind: "log_meal", slot: "meal-2", at: "12:00",
      date: "2026-11-15", items: [{ foodRefId: REF, grams: 100, verdict: "blocked" }] }]);
    expect(result.content).toContain("Off-plan: Tofu.");
  });

  it("retains an explicit log with no classifier when separate same-ref advice is rejected", async () => {
    const { result } = await reply("Logged 100 g tofu for lunch. Try tofu for dinner.", "ready");
    expect(result.body.actions).toHaveLength(1);
    expect(result.content).not.toContain("Try tofu");
    expect(result.content).toContain("Off-plan: Tofu.");
  });

  it.each(["suggest dinner", "could I log 100 g tofu for lunch?", "don't log 100 g tofu for lunch",
    "if I ate 100 g tofu for lunch", "I will eat 100 g tofu for lunch", "log 100 g rice milk for lunch"])(
    "does not retain unsolicited/hypothetical/negated/wrong-subject model logs: %s", async (request) => {
      const { result } = await reply("Logged 100 g tofu for lunch. Try tofu for dinner.", "ready", request);
      expect(result.body.actions).toEqual([]);
      expect(result.content).not.toContain("Try tofu");
    });

  it("does not retain a record whose grams contradict an explicit requested amount", async () => {
    const { result } = await reply("Logged 200 g tofu for lunch. Try tofu for dinner.", "ready",
      "log 100 g tofu for lunch", 200);
    expect(result.body.actions).toEqual([]);
  });

  it("does not bind a lunch confirmation to a snack just because its clock is noon", () => {
    const text = "Logged 100 g tofu for lunch.";
    expect(withoutLogConfirmations(text, [{ name: "Tofu", grams: 100, foodRefId: REF,
      slot: "snack", at: "12:00", occasion: "lunch", verdict: "blocked" }], evidence)).toBe(text);
  });

  it("does not exempt a warning after an intervening sentence", () => {
    const text = "Logged 100 g tofu for lunch. The card is ready. This food is off-plan as it contains soy.";
    const result = withoutLogConfirmations(text, [{ name: "Tofu", grams: 100, foodRefId: REF,
      slot: "meal-2", at: "12:00", occasion: "lunch", verdict: "blocked" }], evidence);
    expect(result).toContain("This food is off-plan");
  });

  it("retains requested real actions only and drops a compound action with an unsolicited item", async () => {
    const riceRef = REF.replace(/1$/, "2");
    const tofu: CoachActionInput = { kind: "log_meal", date: "2026-11-15", slot: "meal-2", at: "12:00",
      title: "Tofu", items: [{ name: "Tofu", grams: 100 }] };
    const rice: CoachActionInput = { ...tofu, title: "Rice", items: [{ name: "Rice", grams: 100 }] };
    const ports = { newActionId: () => REF, searchFoods: async (_u: string, name: string) =>
      [name === "Rice" ? { ...hit, name: "Rice", foodRefId: riceRef, allergenTags: [] } : hit] };
    const separate = (await groundActions("u", [tofu, rice], profile, ports)).actions;
    const combined = (await groundActions("u", [{ ...tofu, items: [...tofu.items, ...rice.items] }], profile, ports)).actions;
    const descriptors = (actions: typeof separate) => actions.flatMap((action) => action.kind === "log_meal"
      ? action.items.map((item) => ({ ...item, slot: action.slot, at: action.at, occasion: "lunch" })) : []);
    const held = { ...evidence, Rice: { ...evidence.Tofu, foodRefId: riceRef, allergenTags: [] } };
    expect(retainRequestedLogs("log 100 g tofu for lunch", separate, descriptors(separate), held)).toEqual([separate[0]]);
    expect(retainRequestedLogs("log 100 g tofu for lunch", combined, descriptors(combined), held)).toEqual([]);
    expect(retainRequestedLogs("log 100 g rice milk for lunch", separate, descriptors(separate), held)).toEqual([]);
  });

  it("retains an unquantified explicit already-eaten spaghetti record without guessing new grams", async () => {
    const input: CoachActionInput = { kind: "log_meal", date: "2026-11-15", slot: "snack", at: "01:14",
      title: "Spaghetti bolognese", items: [{ name: "Spaghetti bolognese", grams: 300 }] };
    const actions = (await groundActions("u", [input], profile, {
      newActionId: () => REF, searchFoods: async () => [{ ...hit, name: "Spaghetti bolognese" }],
    })).actions;
    const items = actions.flatMap((action) => action.kind === "log_meal"
      ? action.items.map((item) => ({ ...item, slot: action.slot, at: action.at, occasion: "snack" })) : []);
    expect(retainRequestedLogs("I just ate spaghetti bolognese as a snack.", actions, items,
      { "Spaghetti bolognese": evidence.Tofu })).toEqual(actions);
  });

  it("keeps every delivered non-confirmation model sentence in the scanned text", () => {
    const items = [{ name: "Tofu", grams: 100, foodRefId: REF, slot: "meal-2", at: "12:00",
      occasion: "lunch", verdict: "blocked" }];
    for (const connector of ["as", "because"]) for (const tail of ["soy", "tofu recommended for dinner"]) {
      const first = "Logged 100 g tofu for lunch.";
      const projected = projectLogText(`${first} This food is off-plan ${connector} it contains ${tail}.`,
        items, evidence, ["Off-plan: Tofu."]);
      for (const sentence of projected.display.split(/(?<=[.!?])\s+/)) {
        if (sentence !== first) expect(projected.advice).toContain(sentence);
      }
    }
  });
});
