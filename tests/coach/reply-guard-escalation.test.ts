import { describe, expect, it } from "vitest";
import { cardEvidence, checkReply } from "@/lib/coach/reply-check";
import { checkReplyLive, startReplyScan } from "@/lib/server/reply-check";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";
import { ruleId } from "@/lib/policy/profiles/types";
import { newModelState } from "@/lib/server/coach-turn/model-state";
import { modelReply } from "@/lib/server/coach-turn/reply";
import type { OpenTurn } from "@/lib/server/coach-turn/types";
import type { TurnKit } from "@/lib/server/coach-turn/kit";
import type { IntentRead } from "@/lib/server/coach-turn/intent";
import type { ModelEnv } from "@/lib/server/coach-turn/model-state";
import { markLoggedActions } from "@/lib/coach/log-policy";
import type { CoachAction } from "@/lib/coach/actions";

const REF = "3f1b1a2c-0000-4000-8000-000000000001";
const entry = { foodRefId: REF, allergenTags: [], category: [], onEatsList: true,
  onAvoidList: false, catalogFoodRevisionId: 1 };

describe("independent reply-guard escalation reproductions", () => {
  it("resolves real evidence names across case without borrowing another ref's facts", () => {
    expect(cardEvidence({ name: "TOFU" }, { Tofu: entry }).foodRefId).toBe(REF);
    const mismatch = cardEvidence({ name: "Tofu", foodRefId: "other-ref" }, { Tofu: entry });
    expect(mismatch.foodRefId).toBeNull();
    expect(mismatch.allergenTags).toBeNull();
  });
  it("blocks advice naming an Avoid card even when the constraint/profile lists are empty", async () => {
    const input = { userId: "u1", text: "Try tofu.", named: [{ name: "Tofu", foodRefId: REF }],
      evidence: { Tofu: { ...entry, onAvoidList: true } }, profile: EMPTY_PROFILE,
      draft: null, actions: [] };
    const result = await checkReplyLive(input, startReplyScan(input, {
      searchFoods: async () => [], profileRules: async () => null,
    }, Date.now() + 1000));
    expect(result.suggestions.every((suggestion) => suggestion.verdict === "blocked")).toBe(true);
    expect(result.content).not.toBe(input.text);
  });

  it("scans an avoided catalog row named by its generic noun with otherwise empty rules", async () => {
    const input = { userId: "u1", text: "Try tofu.", named: [{ name: "Tofu, firm", foodRefId: REF }],
      evidence: { "Tofu, firm": { ...entry, onAvoidList: true } }, profile: EMPTY_PROFILE,
      draft: null, actions: [] };
    const result = await checkReplyLive(input, startReplyScan(input, {
      searchFoods: async () => [{ name: "Tofu, firm", foodRefId: REF, brand: null,
        kcalPer100g: 100, prefStatus: "avoid", allergenTags: [], category: [] }],
      profileRules: async () => null,
    }, Date.now() + 1000));
    expect(result.content).not.toBe(input.text);
  });

  it("reads account Avoid existence before skipping a turn with no prior food evidence", async () => {
    const result = await startReplyScan({ userId: "u1", text: "Try tofu.", named: [], evidence: {},
      profile: EMPTY_PROFILE }, { hasAvoidFoods: async () => true, profileRules: async () => null,
      searchFoods: async () => [{ name: "Tofu", foodRefId: REF, brand: null, kcalPer100g: 100,
        prefStatus: "avoid", allergenTags: [], category: [] }],
    }, Date.now() + 1000);
    expect(result.failing).toContainEqual(expect.objectContaining({ name: "tofu", reason: "avoid_list" }));
  });

  it("fails closed when the account Avoid existence read fails", async () => {
    const result = await startReplyScan({ userId: "u1", text: "Try tofu.", named: [], evidence: {},
      profile: EMPTY_PROFILE }, { hasAvoidFoods: async () => { throw new Error("unavailable"); },
      profileRules: async () => null, searchFoods: async () => [],
    }, Date.now() + 1000);
    expect(result).toMatchObject({ hardRulesActive: true, complete: false });
  });

  it("judges a logged-food mirror card when it is also recommended in the prose", async () => {
    const rules = { asOf: new Date("2026-11-15T00:00:00Z"), items: [{
      id: ruleId("p", "contains_soy"), profileId: "p", facet: "contains_soy", strength: "never" as const,
      hardBasis: "user_rule" as const, confirmation: "confirmed" as const,
      evidenceStrength: null, expiresAt: null,
    }] };
    const result = await startReplyScan({ userId: "u1", text: "Try tofu for dinner.",
      named: [{ name: "Tofu", foodRefId: REF }], evidence: { Tofu: entry }, profile: EMPTY_PROFILE,
      groundedLogged: Promise.resolve({ names: new Set(["tofu"]), refs: new Set([REF]),
        items: [{ name: "Tofu", foodRefId: REF, grams: 100 }] }),
    }, { searchFoods: async () => [], profileRules: async () => rules }, Date.now() + 1000);
    expect(result.failing).toContainEqual(expect.objectContaining({ name: "Tofu", reason: "rule:contains_soy" }));
  });

  it("does not mistake a blocked food name for letters inside an ordinary word", () => {
    const text = "That is a shame.";
    const result = checkReply({ text, named: [], draft: null, actions: [], profile: EMPTY_PROFILE,
      evidence: { ham: { ...entry, onAvoidList: true } } });
    expect(result.content).toBe(text);
  });

  it("passes completed lookup evidence into the final pure card policy check", async () => {
    const state = newModelState([], 0);
    state.step = { kind: "final", text: "Choose an option.", suggestions: [{ name: "Mystery bar", foodRefId: REF }] };
    state.replyScan = { text: state.step.text,
      scan: Promise.resolve({ hardRulesActive: false, complete: true, failing: [] }) };
    const turn = { req: { text: "dinner" }, newId: () => REF, userId: "u1", client: {},
      replyDeadlineAt: Date.now() + 1000, clock: { date: "2026-11-15", now: "2026-11-15T12:00:00Z", tz: "UTC" },
    } as unknown as OpenTurn;
    const kit = { profile: { ...EMPTY_PROFILE, avoid_allergens: ["fish"] }, profileInstances: [],
      foodEvidence: { "Mystery bar": { ...entry, packaged: true, checkedAllergens: ["fish"] } },
      logEntryExists: async () => true, turnAbort: new AbortController(),
    } as unknown as TurnKit;
    const result = await modelReply(turn, kit, { context: null } as ModelEnv, state,
      { history: { summary: null }, intentMs: 0 } as IntentRead);
    expect(result.body.suggestions).toEqual([expect.objectContaining({ name: "Mystery bar", verdict: "allowed" })]);
  });

  it("keeps the log when real log-policy code appends its off-plan warning", async () => {
    const profile = { ...EMPTY_PROFILE, avoid_allergens: ["soy"] };
    const action = { kind: "log_meal", actionId: "a1", date: "2026-11-15", slot: "meal-2", at: "12:00",
      title: "Tofu", flagged: [], items: [{ name: "Tofu", grams: 100, foodRefId: REF,
        catalogFoodRevisionId: 1, kcalPer100g: 100, proteinPer100g: 10, carbsPer100g: 5,
        fatPer100g: 5, verdict: "blocked" }] } as CoachAction;
    const marked = await markLoggedActions("u1", [action], profile, { evidence: {
      status: "ready", preferenceFlags: [], byIdentity: { [`ref:${REF}`]: {
        foodName: "Tofu", allergenTags: ["soy"], policyCategories: [], facets: {}, noCook: null,
        onEatsList: true, onAvoidList: false, role: null,
      } },
    } });
    expect(marked.notices).toEqual(["Off-plan: Tofu."]);
    const state = newModelState([], 0);
    state.step = { kind: "final", text: "Logged 100 g tofu for lunch." };
    state.actions = marked.actions; state.logPolicyNotices = marked.notices;
    state.evidence = { Tofu: { ...entry, allergenTags: ["soy"] } };
    state.replyScan = { text: state.step.text,
      scan: Promise.resolve({ hardRulesActive: true, complete: true, failing: [] }) };
    const turn = { req: { text: "log 100 g tofu" }, newId: () => REF, userId: "u1", client: {},
      replyDeadlineAt: Date.now() + 1000, clock: { date: "2026-11-15", now: "2026-11-15T12:00:00Z", tz: "UTC" },
    } as unknown as OpenTurn;
    const kit = { profile, profileInstances: [], foodEvidence: state.evidence,
      logEntryExists: async () => true, turnAbort: new AbortController() } as unknown as TurnKit;
    const result = await modelReply(turn, kit, { context: null } as ModelEnv, state,
      { history: { summary: null }, intentMs: 0 } as IntentRead);
    expect(result.body.actions).toHaveLength(1);
    expect(result.content).toContain("Off-plan: Tofu.");
  });
});
