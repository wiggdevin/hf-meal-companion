// @vitest-environment jsdom
/**
 * ONB2-P0 (GOAL defect 6): `saveOnboardingPlan` is the one-await replacement for
 * `ConversationalOnboarding.tsx`'s old inline `savePlanAndFinish`. Proves the things that made
 * the old path slow and double-read are gone, with every production dependency injected:
 *   1. the account's food rules are read exactly ONCE for the starter step, never twice — the
 *      exact read handed to the starter write's own `freshRules` override, not a fresh fetch;
 *   2. a rule that would drop the selection below the floor (ONB2-RULE-REREAD) still fails the
 *      whole write with one clean error, off that same single read, never a stale selection;
 *   3. a failed constraints write still gets its one narrow retry before the whole call fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindAccount, unbindAccount } from "@/lib/device/account";
import { createOnboardingState } from "@/lib/profile/onboarding-state";
import { defaultSettings } from "@/lib/store";
import { saveOnboardingPlan, type SaveOnboardingPlanDeps } from "@/lib/onboarding/save-plan";
import { CONSTRAINT_SAVE_WARNING } from "@/lib/profile/onboarding-client";
import { STARTER_RULE_CHANGED_ERROR } from "@/lib/foods/starter-client";
import { legacyInstanceFromCatalog, profileInstancesForLegacyFlags } from "@/lib/policy/profiles/legacy-flags";
import { TargetSaveRefusedError } from "@/lib/targets/client";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const rules = { avoid_allergens: [], avoid_food_ref_ids: [], banned_categories: [], conditions: [], notes: null };
const sixFoods = { "chicken-breast-roasted": "eats", "turkey-breast-roasted": "eats",
  "white-rice-cooked": "eats", "brown-rice-cooked": "eats",
  "olive-oil": "eats", "avocado-oil": "eats" } as const;

function baseDeps(overrides: Partial<SaveOnboardingPlanDeps> = {}): SaveOnboardingPlanDeps {
  return {
    persistPlan: vi.fn(async () => ({ settings: defaultSettings(), constraintsSaved: true })),
    retryConstraints: vi.fn(async () => true),
    readRules: vi.fn(async () => ({ profile: rules, instances: [] })),
    writeStarter: vi.fn(async () => 2),
    deliverWrites: vi.fn(async () => ({ delivered: true, pending: { userSettings: 0, foodMembership: 0 } })),
    marksStand: vi.fn(() => true),
    mirrorOnboardedAt: vi.fn(async () => "2026-10-07T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  bindAccount(USER_ID);
});

afterEach(() => {
  unbindAccount();
});

describe("saveOnboardingPlan", () => {
  it("reads the account's food rules exactly once and hands that same read to the starter write", async () => {
    const deps = baseDeps();
    const result = await saveOnboardingPlan({
      settings: defaultSettings(),
      onboardingState: createOnboardingState(defaultSettings()),
      starter: { status: "pilot", marks: sixFoods, plannedCount: 0 },
    }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.readRules).toHaveBeenCalledTimes(1);
    expect(deps.writeStarter).toHaveBeenCalledTimes(1);
    // The `freshRules` override handed to the starter write must resolve to the ALREADY-read
    // rules, not fetch a second time.
    const [, , starterDeps] = (deps.writeStarter as ReturnType<typeof vi.fn>).mock.calls[0];
    await expect(starterDeps.freshRules()).resolves.toEqual({ profile: rules, instances: [] });
    expect(deps.readRules).toHaveBeenCalledTimes(1);
  });

  it("never reads rules or writes starter foods when the plan has no starter step", async () => {
    const deps = baseDeps();
    const result = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
    }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.readRules).not.toHaveBeenCalled();
    expect(deps.writeStarter).not.toHaveBeenCalled();
    expect(deps.persistPlan).toHaveBeenCalledTimes(1);
    expect(deps.deliverWrites).toHaveBeenCalledTimes(1);
  });

  it("fails the whole write, never a partial one, when the single fresh read drops the selection below the floor", async () => {
    const deps = baseDeps({
      readRules: vi.fn(async () => ({
        profile: { ...rules, banned_categories: ["poultry", "beef"] }, instances: [],
      })),
    });
    const result = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
      starter: { status: "pilot", marks: sixFoods, plannedCount: 0 },
    }, deps);

    // The refusal names the picked food and the rule that withholds it, and carries a code the
    // shell uses to send the person back to Foods (W062 BLOCK 1).
    expect(result).toEqual({ ok: false, code: "starter_rules",
      error: "Chicken breast, roasted doesn't fit your no-poultry rule. Go back to Foods, take it off, and pick again." });
    expect(result.ok === false && result.error).not.toBe(STARTER_RULE_CHANGED_ERROR);
    expect(deps.writeStarter).not.toHaveBeenCalled();
  });

  it("a halal plus no-beef account saves its fish, egg and plant picks; a conflicting pick is named, and a retry after fixing it saves", async () => {
    const halal = legacyInstanceFromCatalog("halal", "2026-09-01")!;
    const noBeef = profileInstancesForLegacyFlags(["no_beef"], "2026-09-01");
    const readRules = vi.fn(async () => ({ profile: rules, instances: [halal, ...noBeef] }));
    const deps = baseDeps({ readRules });
    const input = (marks: Record<string, "eats">) => ({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
      starter: { status: "pilot" as const, marks, plannedCount: 0 },
    });
    const good = { "salmon-wild-sockeye-cooked": "eats", "egg-white": "eats",
      "white-rice-cooked": "eats", "brown-rice-cooked": "eats",
      "olive-oil": "eats", "avocado-oil": "eats" } as const;
    expect(await saveOnboardingPlan(input(good), deps)).toEqual({ ok: true });
    expect(deps.writeStarter).toHaveBeenCalledTimes(1);
    // A pick the floor needs but a rule withholds is refused by name, with nothing written.
    (deps.writeStarter as ReturnType<typeof vi.fn>).mockClear();
    const bad = await saveOnboardingPlan(input({ "ground-beef-90-10-cooked": "eats", "egg-white": "eats",
      "white-rice-cooked": "eats", "brown-rice-cooked": "eats", "olive-oil": "eats", "avocado-oil": "eats" }), deps);
    expect(bad).toMatchObject({ ok: false, code: "starter_rules" });
    expect(bad.ok === false && bad.error).toMatch(/Ground beef.*no[ -]beef rule/);
    expect(deps.writeStarter).not.toHaveBeenCalled();
    // After the person takes the food off, the same call saves.
    expect(await saveOnboardingPlan(input(good), deps)).toEqual({ ok: true });
    expect(deps.writeStarter).toHaveBeenCalledTimes(1);
  });

  it("a peanut allergy account saves a selection with no peanut-containing starter", async () => {
    const peanut = legacyInstanceFromCatalog("allergy_peanut", "2026-09-01")!;
    const deps = baseDeps({ readRules: vi.fn(async () => ({ profile: rules, instances: [peanut] })) });
    const result = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
      starter: { status: "pilot", marks: sixFoods, plannedCount: 0 },
    }, deps);
    expect(result).toEqual({ ok: true });
    const refused = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
      starter: { status: "pilot", marks: { "chicken-breast-roasted": "eats", "turkey-breast-roasted": "eats",
        "white-rice-cooked": "eats", "brown-rice-cooked": "eats", "olive-oil": "eats", "peanut-butter": "eats" }, plannedCount: 0 },
    }, deps);
    expect(refused).toMatchObject({ ok: false, code: "starter_rules" });
    expect(refused.ok === false && refused.error).toMatch(/Peanut butter.*peanut allergy/);
  });

  it("fails closed when the one rules read itself fails, rather than writing an unverified selection", async () => {
    const deps = baseDeps({ readRules: vi.fn(async () => null) });
    const result = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
      starter: { status: "pilot", marks: sixFoods, plannedCount: 0 },
    }, deps);

    expect(result.ok).toBe(false);
    expect(deps.writeStarter).not.toHaveBeenCalled();
  });

  it("retries the constraints write once before failing when persistPlan's own write did not land", async () => {
    const deps = baseDeps({
      persistPlan: vi.fn(async () => ({ settings: defaultSettings(), constraintsSaved: false })),
      retryConstraints: vi.fn(async () => false),
    });
    const result = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
    }, deps);

    expect(result).toEqual({ ok: false, error: CONSTRAINT_SAVE_WARNING });
    expect(deps.retryConstraints).toHaveBeenCalledTimes(1);
  });

  it("reports the sync warning when the outbox never drains", async () => {
    const deps = baseDeps({ deliverWrites: vi.fn(async () => ({ delivered: false, pending: { userSettings: 1, foodMembership: 0 } })) });
    const result = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
    }, deps);

    expect(result.ok).toBe(false);
    expect(deps.mirrorOnboardedAt).not.toHaveBeenCalled();
  });

  it("passes the safety round to the plan write and never retries a failed condition patch flags-only (G7)", async () => {
    const deps = baseDeps({
      persistPlan: vi.fn(async () => ({ settings: defaultSettings(), constraintsSaved: false, error: "x" })),
    });
    const result = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
      safety: { pregnancy: "pregnant" },
    }, deps);

    expect(result).toEqual({ ok: false, error: "x" });
    const call = (deps.persistPlan as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[4]).toEqual({ pregnancy: "pregnant" });
    expect(deps.retryConstraints).not.toHaveBeenCalled();
    expect(deps.deliverWrites).not.toHaveBeenCalled();
  });

  it("names the server's 422 adult_only and 409 rate_not_eligible refusals so the shell can route", async () => {
    const adult = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
    }, baseDeps({ persistPlan: vi.fn(async () => { throw new TargetSaveRefusedError(422, "adult_only"); }) }));
    expect(adult).toMatchObject({ ok: false, code: "adult_only" });
    const held = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
    }, baseDeps({ persistPlan: vi.fn(async () => { throw new TargetSaveRefusedError(409, "rate_not_eligible"); }) }));
    expect(held).toMatchObject({ ok: false, code: "rate_not_eligible" });
    const other = await saveOnboardingPlan({
      settings: defaultSettings(), onboardingState: createOnboardingState(defaultSettings()),
    }, baseDeps({ persistPlan: vi.fn(async () => { throw new TargetSaveRefusedError(400, "bad_request"); }) }));
    expect(other).toEqual({ ok: false, error: "save targets failed: 400" });
  });
});
