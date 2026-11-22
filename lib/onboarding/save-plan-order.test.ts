// @vitest-environment jsdom
/**
 * W062 verify round (Sol + Neon BLOCK on save-plan.ts): the order of a save is
 *   fresh rules read + selection check -> plan (constraints, conditions, target; `onboarded_at`
 *   deferred) -> starter writes -> the stamp, last -> drain and mirror.
 * A refusal at any step stops there: nothing starter-related is queued before the plan's safety,
 * age and rate checks pass, and the account is never stamped before its foods were written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindAccount, unbindAccount } from "@/lib/device/account";
import { createOnboardingState } from "@/lib/profile/onboarding-state";
import { defaultSettings } from "@/lib/store";
import {
  readFreshStarterRules, saveOnboardingPlan, type SaveOnboardingPlanDeps,
} from "@/lib/onboarding/save-plan";
import { CONSTRAINT_SAVE_WARNING } from "@/lib/profile/onboarding-client";
import { STARTER_RULE_CHANGED_ERROR } from "@/lib/foods/starter-client";
import { TargetSaveRefusedError } from "@/lib/targets/client";
import { AdultOnlyError } from "@/lib/profile/rate-eligibility";

const reads = vi.hoisted(() => ({ constraints: vi.fn(), review: vi.fn(), instances: vi.fn() }));
vi.mock("@/lib/constraints-client", () => ({ loadConstraints: reads.constraints }));
vi.mock("@/lib/rule-review-client", () => ({ loadRuleReview: reads.review }));
vi.mock("@/lib/profile/instances-client", () => ({ fetchProfileInstances: reads.instances }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const rules = { avoid_allergens: [], avoid_food_ref_ids: [], banned_categories: [], conditions: [], notes: null };
const sixFoods = { "chicken-breast-roasted": "eats", "turkey-breast-roasted": "eats",
  "white-rice-cooked": "eats", "brown-rice-cooked": "eats",
  "olive-oil": "eats", "avocado-oil": "eats" } as const;

function deps(calls: string[], overrides: Partial<SaveOnboardingPlanDeps> = {}): SaveOnboardingPlanDeps {
  return {
    persistPlan: vi.fn(async () => {
      calls.push("plan");
      return { settings: defaultSettings(), constraintsSaved: true,
        stamp: async () => { calls.push("stamp"); } };
    }),
    retryConstraints: vi.fn(async () => { calls.push("retry"); return true; }),
    readRules: vi.fn(async () => { calls.push("read"); return { profile: rules, instances: [] }; }),
    writeStarter: vi.fn(async () => { calls.push("foods"); return 2; }),
    deliverWrites: vi.fn(async () => { calls.push("deliver");
      return { delivered: true, pending: { userSettings: 0, foodMembership: 0 } }; }),
    marksStand: vi.fn(() => true),
    mirrorOnboardedAt: vi.fn(async () => { calls.push("mirror"); return "2026-10-07T00:00:00.000Z"; }),
    ...overrides,
  };
}

const input = (extra: Record<string, unknown> = {}) => ({
  settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
  starter: { status: "pilot" as const, marks: sixFoods, plannedCount: 0 }, ...extra,
});

beforeEach(() => { bindAccount(USER_ID); });
afterEach(() => { unbindAccount(); });

describe("save order: plan first, foods second, stamp last", () => {
  it("runs read, plan, foods, stamp, deliver, mirror in that order, and defers the stamp", async () => {
    const calls: string[] = [];
    const d = deps(calls);
    expect(await saveOnboardingPlan(input(), d)).toEqual({ ok: true });
    expect(calls).toEqual(["read", "plan", "foods", "stamp", "deliver", "mirror"]);
    const args = (d.persistPlan as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[7]).toEqual({ deferStamp: true });
  });

  it.each([
    ["under 18", () => { throw new AdultOnlyError(); }, "adult_only"],
    ["a held pace", () => { throw new TargetSaveRefusedError(409, "rate_not_eligible"); }, "rate_not_eligible"],
  ])("%s refuses the plan with NO starter write queued and NO stamp", async (_name, refuse, code) => {
    const calls: string[] = [];
    const d = deps(calls, { persistPlan: vi.fn(async () => { refuse(); throw new Error("unreachable"); }) });
    const result = await saveOnboardingPlan(input(), d);
    expect(result).toMatchObject({ ok: false, code });
    expect(d.writeStarter).not.toHaveBeenCalled();
    expect(d.deliverWrites).not.toHaveBeenCalled();
    expect(calls).not.toContain("foods");
    expect(calls).not.toContain("stamp");
  });

  it("a failed safety-condition write queues no foods and stamps nothing", async () => {
    const calls: string[] = [];
    const stamp = vi.fn(async () => undefined);
    const d = deps(calls, { persistPlan: vi.fn(async (base) => ({
      settings: base, constraintsSaved: false, profileWritten: false as const, stamp,
    })) });
    const result = await saveOnboardingPlan(input({ safety: { pregnancy: "pregnant" } }), d);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("") });
    expect(d.writeStarter).not.toHaveBeenCalled();
    expect(stamp).not.toHaveBeenCalled();
  });

  it("a failed constraints write (no conditions) retries once, and a failed retry queues no foods", async () => {
    const calls: string[] = [];
    const stamp = vi.fn(async () => undefined);
    const d = deps(calls, {
      persistPlan: vi.fn(async (base) => ({ settings: base, constraintsSaved: false, stamp })),
      retryConstraints: vi.fn(async () => false),
    });
    expect(await saveOnboardingPlan(input(), d)).toEqual({ ok: false, error: CONSTRAINT_SAVE_WARNING });
    expect(d.writeStarter).not.toHaveBeenCalled();
    expect(stamp).not.toHaveBeenCalled();
  });

  it("a failed food write leaves the account unstamped", async () => {
    const calls: string[] = [];
    const stamp = vi.fn(async () => undefined);
    const d = deps(calls, {
      persistPlan: vi.fn(async (base) => ({ settings: base, constraintsSaved: true, stamp })),
      writeStarter: vi.fn(async () => { throw new Error("Couldn't save"); }),
    });
    expect(await saveOnboardingPlan(input(), d)).toEqual({ ok: false, error: "Couldn't save" });
    expect(stamp).not.toHaveBeenCalled();
    expect(d.deliverWrites).not.toHaveBeenCalled();
  });

  it("a rule saved since the read (the write's own recheck) goes back to Foods, unstamped", async () => {
    const stamp = vi.fn(async () => undefined);
    const d = deps([], {
      persistPlan: vi.fn(async (base) => ({ settings: base, constraintsSaved: true, stamp })),
      writeStarter: vi.fn(async () => { throw new Error(STARTER_RULE_CHANGED_ERROR); }),
    });
    expect(await saveOnboardingPlan(input(), d)).toMatchObject({ ok: false, code: "starter_rules" });
    expect(stamp).not.toHaveBeenCalled();
  });

  it("a failed stamp fails the save before the drain", async () => {
    const d = deps([], {
      persistPlan: vi.fn(async (base) => ({ settings: base, constraintsSaved: true,
        stamp: async () => { throw new Error("stamp failed"); } })),
    });
    expect(await saveOnboardingPlan(input(), d)).toEqual({ ok: false, error: "stamp failed" });
    expect(d.deliverWrites).not.toHaveBeenCalled();
  });

  it("a starter-free save (no starter step) still stamps once, after the plan", async () => {
    const calls: string[] = [];
    const d = deps(calls);
    expect(await saveOnboardingPlan({ settings: defaultSettings(),
      onboardingState: createOnboardingState(defaultSettings()) }, d)).toEqual({ ok: true });
    expect(calls).toEqual(["plan", "stamp", "deliver", "mirror"]);
  });
});

describe("the preflight judges the projected constraint patch persistence writes", () => {
  it("hands the starter write the profile WITH the draft flags' allergen exclusions and the safety conditions", async () => {
    const d = deps([]);
    const state = { ...createOnboardingState(defaultSettings()), flags: ["no_eggs" as const] };
    const result = await saveOnboardingPlan(input({ onboardingState: state,
      safety: { pregnancy: "pregnant" },
      starter: { status: "pilot" as const, plannedCount: 0, marks: {
        "chicken-breast-roasted": "eats", "turkey-breast-roasted": "eats", "white-rice-cooked": "eats",
        "brown-rice-cooked": "eats", "olive-oil": "eats", "avocado-oil": "eats" } } }), d);
    expect(result).toEqual({ ok: true });
    const [, , starterDeps] = (d.writeStarter as ReturnType<typeof vi.fn>).mock.calls[0];
    const seen = await starterDeps.freshRules();
    expect(seen.profile.avoid_allergens).toContain("egg");
    expect(seen.profile.conditions.join(" ").toLowerCase()).toContain("pregnan");
  });

  it("an Eats pick the projected rules withhold is REPORTED (starter_rules), never dropped silently", async () => {
    const calls: string[] = [];
    const d = deps(calls);
    const state = { ...createOnboardingState(defaultSettings()), flags: ["no_eggs" as const] };
    const result = await saveOnboardingPlan(input({ onboardingState: state,
      starter: { status: "pilot" as const, plannedCount: 0, marks: { ...sixFoods, "white-bread": "eats" } } }), d);
    expect(result).toMatchObject({ ok: false, code: "starter_rules" });
    expect(result.ok === false && result.error).toMatch(/White bread/);
    expect(calls).toEqual(["read"]);
  });

  it("a pregnancy answer withholds picked tuna before anything is written", async () => {
    const calls: string[] = [];
    const d = deps(calls);
    const result = await saveOnboardingPlan(input({ safety: { pregnancy: "pregnant" },
      starter: { status: "pilot" as const, plannedCount: 0, marks: {
        ...sixFoods, "tuna-canned-in-water-light": "eats" } } }), d);
    expect(result).toMatchObject({ ok: false, code: "starter_rules" });
    expect(calls).toEqual(["read"]);
  });
});

describe("explicit Avoid marks are never dropped", () => {
  it("writes an Avoid mark on a food the rules withhold, alongside the eligible Eats", async () => {
    const d = deps([]);
    const marks = { ...sixFoods, "white-bread": "avoid" } as const;
    const state = { ...createOnboardingState(defaultSettings()), flags: ["no_eggs" as const] };
    const result = await saveOnboardingPlan(input({ onboardingState: state,
      starter: { status: "pilot" as const, plannedCount: 0, marks } }), d);
    expect(result).toEqual({ ok: true });
    const [written] = (d.writeStarter as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(written["white-bread"]).toBe("avoid");
    expect(written["chicken-breast-roasted"]).toBe("eats");
  });

  it("a starter-free account (all withheld) still writes its explicit Avoid marks", async () => {
    const d = deps([], { readRules: vi.fn(async () => ({
      profile: { ...rules, avoid_food_ref_ids: ["11111111-2222-4333-8444-555555555555"] }, instances: [] })) });
    const result = await saveOnboardingPlan(input({
      starter: { status: "pilot" as const, plannedCount: 0, marks: { "tofu-firm": "avoid" } } }), d);
    expect(result).toEqual({ ok: true });
    const [written, allowed] = (d.writeStarter as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(written).toEqual({ "tofu-firm": "avoid" });
    expect(allowed).toEqual([]);
  });
});

describe("the fresh rules read fails closed on the rule review", () => {
  const ok = { profile: rules, rev: 0 };
  const instances = { instances: [], catalog: [], legacyProfileIds: [] };
  const handle = () => ({ userId: USER_ID, epoch: 0 }) as never;

  it("returns the rules when the review is settled", async () => {
    reads.constraints.mockResolvedValue(ok);
    reads.review.mockResolvedValue({ required: false, candidateAllergens: [], candidateCategories: [], rev: 0 });
    reads.instances.mockResolvedValue(instances);
    expect(await readFreshStarterRules(handle())).toEqual({ profile: rules, instances: [] });
  });

  it("returns null when a review is required", async () => {
    reads.constraints.mockResolvedValue(ok);
    reads.review.mockResolvedValue({ required: true, candidateAllergens: ["soy"], candidateCategories: [], rev: 0 });
    reads.instances.mockResolvedValue(instances);
    expect(await readFreshStarterRules(handle())).toBeNull();
  });

  it("returns null when the review cannot be read", async () => {
    reads.constraints.mockResolvedValue(ok);
    reads.review.mockResolvedValue(null);
    reads.instances.mockResolvedValue(instances);
    expect(await readFreshStarterRules(handle())).toBeNull();
  });

  it("a refused read stops the save before anything is written", async () => {
    const d = deps([], { readRules: vi.fn(async () => null) });
    const result = await saveOnboardingPlan(input(), d);
    expect(result.ok).toBe(false);
    expect(d.persistPlan).not.toHaveBeenCalled();
  });
});
