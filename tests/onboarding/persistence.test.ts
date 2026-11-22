import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  persistCompletedOnboarding, saveOnboardingSettings, type OnboardingPersistence,
} from "@/lib/profile/onboarding-client";
import { createOnboardingState, onboardingReducer } from "@/lib/profile/onboarding-state";
import { defaultSettings } from "@/lib/store";
import { allOps } from "@/lib/sync/idb";
import type { Settings } from "@/lib/types";
import { resetTestAccount } from "@/tests/helpers/account";
import type { AccountHandle } from "@/lib/device/account";

let h: AccountHandle;

describe("the normalized onboarding settings write", () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    h = await resetTestAccount();
  });

  it("queues the six required profile fields and the optional onboarding choices", async () => {
    // Local noon on the intended date: unlike a fixed UTC time, this stays on 2026-09-19 as the
    // local calendar day no matter the process time zone (including UTC+13 and beyond).
    const onboardedAt = new Date(2026, 8, 19, 12, 0).toISOString();
    const writeTargets = vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      revision: 1,
      source: "derived" as const,
      effectiveFrom: "2026-09-19",
      training: { kcal: 2200, protein: 120, carbs: 250, fat: 80 },
      rest: { kcal: 1800, protein: 120, carbs: 150, fat: 80 },
      pins: { trainingKcal: null, restKcal: null, proteinG: null },
      inputs: { effectiveDate: "2026-09-19", weightKg: 57.25,
        weightSource: "weigh-in" as const, trainingWeekdays: [1, 3, 4, 5],
        activity: "moderate" as const, goal: "recomp" as const, goalRateBpWeek: 0,
        formulaName: "profile-energy-v1" },
    }));
    const revision = await saveOnboardingSettings({
      ...defaultSettings(),
      sex: "female",
      birthYear: 1996,
      heightCm: 165,
      weightKg: 60,
      activityLevel: "moderate",
      goal: "recomp",
      bodyFatPct: 19.5,
      trainingWeekdays: [1, 3, 4, 5],
      dietPrefs: { text: "No shellfish", flags: ["no_shellfish"] },
      onboardedAt,
      activeTargetProfile: {
        training: { kcal: 2200, protein: 120, carbs: 250, fat: 80 },
        rest: { kcal: 1800, protein: 120, carbs: 170, fat: 71 },
      },
    }, "complete", [], writeTargets, () => 57.25);

    expect((await allOps(h))[0].payload).toMatchObject({
      sex: "female",
      birth_year: 1996,
      height_cm: 165,
      weight_kg: 60,
      activity_level: "moderate",
      goal: "recomp",
      body_fat_pct: 19.5,
      training_weekdays: [1, 3, 4, 5],
      diet_prefs: { text: "No shellfish", flags: ["no_shellfish"] },
      onboarded_at: onboardedAt,
    });
    expect((await allOps(h))[0].payload).not.toHaveProperty("training_kcal");
    expect((await allOps(h))[0].payload).not.toHaveProperty("rest_kcal");
    expect((await allOps(h))[0].payload).not.toHaveProperty("protein_g");
    expect(writeTargets).toHaveBeenCalledWith(expect.objectContaining({
      latestWeighInKg: 57.25,
      today: "2026-09-19",
      trainingWeekdays: [1, 3, 4, 5],
      source: "derived",
    }));
    expect(revision).toMatchObject({ revision: 1, source: "derived" });
  });

  it("dates the target revision from the local day onboarding finished, not the UTC day", async () => {
    const writeTargets = vi.fn(async () => undefined);
    // 23:30 local on 2026-09-20; in any zone west of UTC this is already 2026-09-21 in UTC.
    const onboardedAt = new Date(2026, 8, 20, 23, 30).toISOString();
    await saveOnboardingSettings({
      ...defaultSettings(),
      sex: "female", birthYear: 1996, heightCm: 165, weightKg: 60,
      activityLevel: "moderate", goal: "recomp", onboardedAt,
    }, "complete", [], writeTargets as never, () => 60);
    expect(writeTargets).toHaveBeenCalledWith(expect.objectContaining({ today: "2026-09-20" }));
  });

  it("queues target pins when onboarding changes the derived defaults", async () => {
    await saveOnboardingSettings({
      ...defaultSettings(),
      trainingKcal: 2300,
      restKcal: 1900,
      proteinG: 135,
      onboardedAt: "2026-09-19T15:30:00.000Z",
    }, "complete", ["trainingKcal", "restKcal", "proteinG"]);

    expect((await allOps(h))[0].payload).toMatchObject({
      training_kcal: 2300,
      rest_kcal: 1900,
      protein_g: 135,
    });
  });

  it("stores the accepted onboarding weight before targets and settings cache", async () => {
    let state = createOnboardingState(defaultSettings());
    const actions = [
      { type: "edit_body", key: "heightCm", value: "165" },
      { type: "edit_body", key: "birthYear", value: "1996" },
      { type: "set_sex", value: "female" },
      { type: "edit_weight", value: "132.277" },
      { type: "set_activity", value: "moderate" },
      { type: "set_goal", value: "recomp" },
    ] as const;
    for (const action of actions) state = onboardingReducer(state, action);
    const order: string[] = [];

    await persistCompletedOnboarding(defaultSettings(), state,
      new Date("2026-09-19T15:30:00.000Z"), {
        saveLocal: () => { order.push("cache"); },
        saveSynced: async () => { order.push("targets"); },
        saveWeighIn: async () => { order.push("weigh-in"); return null; },
        loadConstraints: async () => null,
        saveConstraints: vi.fn(),
        localDate: () => "2026-09-19",
        hasWeighIn: () => false,
        openFoodWorld: async () => {},
      });

    expect(order).toEqual(["weigh-in", "targets", "cache"]);
  });

  it("opens the food world on a FIRST completion only, never on a later re-run (W13, D14)", async () => {
    let state = createOnboardingState(defaultSettings());
    const actions = [
      { type: "edit_body", key: "heightCm", value: "165" },
      { type: "edit_body", key: "birthYear", value: "1996" },
      { type: "set_sex", value: "female" },
      { type: "edit_weight", value: "132.277" },
      { type: "set_activity", value: "moderate" },
      { type: "set_goal", value: "recomp" },
    ] as const;
    for (const action of actions) state = onboardingReducer(state, action);
    const openFoodWorld = vi.fn(async () => {});
    const deps = {
      saveLocal: vi.fn(), saveSynced: vi.fn(async () => undefined),
      saveWeighIn: vi.fn(async () => null), loadConstraints: vi.fn(async () => null),
      saveConstraints: vi.fn(), localDate: () => "2026-09-19", hasWeighIn: () => false,
      openFoodWorld,
    };

    // Never onboarded before: this IS the account's first completion.
    await persistCompletedOnboarding({ ...defaultSettings(), onboardedAt: null }, state,
      new Date("2026-09-19T15:30:00.000Z"), deps);
    expect(openFoodWorld).toHaveBeenCalledTimes(1);

    // Already onboarded: editing the profile again must not re-invite an account that chose closed.
    openFoodWorld.mockClear();
    await persistCompletedOnboarding(
      { ...defaultSettings(), onboardedAt: "2026-09-18T00:00:00.000Z" }, state,
      new Date("2026-09-19T15:30:00.000Z"), deps);
    expect(openFoodWorld).not.toHaveBeenCalled();
  });

  it("writes confirmed flags and cooking effort in one completion settings write", async () => {
    let state = createOnboardingState(defaultSettings());
    const actions = [
      { type: "edit_body", key: "heightCm", value: "165" },
      { type: "edit_body", key: "birthYear", value: "1996" },
      { type: "set_sex", value: "female" },
      { type: "edit_weight", value: "132.277" },
      { type: "set_activity", value: "moderate" },
      { type: "set_goal", value: "recomp" },
      { type: "toggle_flag", flag: "vegetarian" },
      { type: "set_cooking_effort", value: "minimal" },
    ] as const;
    for (const action of actions) state = onboardingReducer(state, action);
    const saveSynced = vi.fn(async (_settings: Settings) => undefined);

    const result = await persistCompletedOnboarding(defaultSettings(), state,
      new Date("2026-09-19T15:30:00.000Z"), {
        saveLocal: vi.fn(),
        saveSynced,
        saveWeighIn: vi.fn(async () => null),
        loadConstraints: vi.fn(async () => null),
        saveConstraints: vi.fn(),
        localDate: () => "2026-09-19",
        hasWeighIn: () => false,
        openFoodWorld: async () => {},
      });

    expect(saveSynced).toHaveBeenCalledOnce();
    expect(saveSynced).toHaveBeenCalledWith(expect.objectContaining({
      dietPrefs: {
        text: "",
        flags: ["vegetarian"],
        lifestyle: { cookingEffort: "minimal" },
      },
    }), "complete", []);
    expect(result.settings.dietPrefs).toEqual({
      text: "",
      flags: ["vegetarian"],
      lifestyle: { cookingEffort: "minimal" },
    });
  });

  it("does not write an unconfirmed cooking-effort suggestion", async () => {
    let state = createOnboardingState(defaultSettings());
    const actions = [
      { type: "edit_body", key: "heightCm", value: "165" },
      { type: "edit_body", key: "birthYear", value: "1996" },
      { type: "set_sex", value: "female" },
      { type: "edit_weight", value: "132.277" },
      { type: "set_activity", value: "moderate" },
      { type: "set_goal", value: "recomp" },
      { type: "toggle_flag", flag: "vegetarian" },
    ] as const;
    for (const action of actions) state = onboardingReducer(state, action);
    const saveSynced = vi.fn(async (_settings: Settings) => undefined);

    await persistCompletedOnboarding(defaultSettings(), state,
      new Date("2026-09-19T15:30:00.000Z"), {
        saveLocal: vi.fn(),
        saveSynced,
        saveWeighIn: vi.fn(async () => null),
        loadConstraints: vi.fn(async () => null),
        saveConstraints: vi.fn(),
        localDate: () => "2026-09-19",
        hasWeighIn: () => false,
        openFoodWorld: async () => {},
      });

    expect(saveSynced).toHaveBeenCalledOnce();
    const writtenSettings = saveSynced.mock.calls[0]?.[0];
    expect(writtenSettings?.dietPrefs).toEqual({ text: "", flags: ["vegetarian"] });
    expect(writtenSettings?.dietPrefs).not.toHaveProperty("lifestyle");
  });

  it("queues only onboarded_at for skip", async () => {
    await saveOnboardingSettings({
      ...defaultSettings(),
      heightCm: 165,
      onboardedAt: "2026-09-19T15:30:00.000Z",
    }, "skip");

    expect((await allOps(h))[0].payload).toEqual({
      onboarded_at: "2026-09-19T15:30:00.000Z",
    });
  });
});

// GPT-6 Sol BLOCK (onb2-p0): the save's one target request id reaches the target write, so the
// shell's retry after a lost answer is the same request on the server.
describe("the onboarding save's target request id", () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    h = await resetTestAccount();
  });

  it("is handed to the target write unchanged", async () => {
    const writeTargets = vi.fn(async () => undefined as never);
    await saveOnboardingSettings({
      ...defaultSettings(), sex: "female", birthYear: 1996, heightCm: 165, weightKg: 60,
      activityLevel: "moderate", goal: "recomp", trainingWeekdays: [],
      onboardedAt: new Date(2026, 8, 19, 12, 0).toISOString(),
    }, "complete", [], writeTargets, () => 60, "00000000-0000-4000-8000-0000000000bb");
    expect(writeTargets).toHaveBeenCalledWith(expect.objectContaining({ today: "2026-09-19" }),
      undefined, undefined, "00000000-0000-4000-8000-0000000000bb");
  });

  it("is passed from persistCompletedOnboarding to the synced settings write", async () => {
    let state = createOnboardingState(defaultSettings());
    for (const action of [
      { type: "edit_body", key: "heightCm", value: "165" },
      { type: "edit_body", key: "birthYear", value: "1996" },
      { type: "set_sex", value: "female" },
      { type: "edit_weight", value: "132" },
      { type: "set_activity", value: "moderate" },
      { type: "set_goal", value: "recomp" },
    ] as const) state = onboardingReducer(state, action);
    const saveSynced = vi.fn(async () => undefined);
    await persistCompletedOnboarding(defaultSettings(), state, new Date(2026, 8, 19, 12, 0), {
      saveLocal: vi.fn(), saveSynced, saveWeighIn: vi.fn(async () => null),
      loadConstraints: vi.fn(async () => ({ profile: { avoid_allergens: [], avoid_food_ref_ids: [],
        banned_categories: [], conditions: [], notes: null }, rev: 0 })),
      saveConstraints: vi.fn(async () => ({ status: "ok" }) as never), openFoodWorld: async () => {},
      localDate: () => "2026-09-19", hasWeighIn: () => true,
    }, {}, "00000000-0000-4000-8000-0000000000cc");
    expect(saveSynced).toHaveBeenCalledWith(expect.anything(), "complete", expect.any(Array),
      "00000000-0000-4000-8000-0000000000cc");
  });

  // W062 verify round (Sol + Neon BLOCK): the account must not look finished before its foods were
  // written. `deferStamp` writes the whole profile row without `onboarded_at`; `stamp()` is the one
  // later write that sets it (and opens the food world on a first completion).
  describe("deferred onboarded_at stamp", () => {
    const completeState = () => {
      let state = createOnboardingState(defaultSettings());
      for (const action of [
        { type: "edit_body", key: "heightCm", value: "165" },
        { type: "edit_body", key: "birthYear", value: "1996" },
        { type: "set_sex", value: "female" },
        { type: "edit_weight", value: "132" },
        { type: "set_activity", value: "moderate" },
        { type: "set_goal", value: "recomp" },
      ] as const) state = onboardingReducer(state, action);
      return state;
    };
    const persistence = () => ({
      saveLocal: vi.fn<(settings: Settings) => void>(),
      saveSynced: vi.fn<OnboardingPersistence["saveSynced"]>(async () => undefined),
      saveWeighIn: vi.fn(async () => null),
      loadConstraints: vi.fn(async () => ({ profile: { avoid_allergens: [], avoid_food_ref_ids: [],
        banned_categories: [], conditions: [], notes: null }, rev: 0 })),
      saveConstraints: vi.fn(async () => ({ status: "ok" }) as never), openFoodWorld: vi.fn(async () => {}),
      localDate: () => "2026-09-19", hasWeighIn: () => true,
    });
    const now = new Date(2026, 8, 19, 12, 0);

    it("writes the profile without the stamp, and stamps only when stamp() runs", async () => {
      const deps = persistence();
      const result = await persistCompletedOnboarding(defaultSettings(), completeState(), now, deps,
        {}, undefined, null, { deferStamp: true });
      expect(result.constraintsSaved).toBe(true);
      // The one profile write asked to omit the stamp; nothing stamped, the world not opened, and
      // this device keeps no `onboardedAt` either.
      expect(deps.saveSynced).toHaveBeenCalledTimes(1);
      expect(deps.saveSynced.mock.calls[0][1]).toBe("complete");
      expect(deps.saveSynced.mock.calls[0][4]).toBe(true);
      expect(deps.openFoodWorld).not.toHaveBeenCalled();
      expect(deps.saveLocal).toHaveBeenCalledTimes(1);
      expect(deps.saveLocal.mock.calls[0][0].onboardedAt ?? null).toBeNull();

      await result.stamp!();
      expect(deps.saveSynced).toHaveBeenCalledTimes(2);
      expect(deps.saveSynced.mock.calls[1][1]).toBe("skip");
      expect(deps.saveSynced.mock.calls[1][0].onboardedAt).toEqual(expect.any(String));
      expect(deps.saveLocal.mock.calls.at(-1)![0].onboardedAt).toEqual(expect.any(String));
      expect(deps.openFoodWorld).toHaveBeenCalledTimes(1);
    });

    it("runs the stamp once, even if the caller retries after it succeeded", async () => {
      const deps = persistence();
      const result = await persistCompletedOnboarding(defaultSettings(), completeState(), now, deps,
        {}, undefined, null, { deferStamp: true });
      await result.stamp!();
      await result.stamp!();
      expect(deps.saveSynced).toHaveBeenCalledTimes(2);
      expect(deps.openFoodWorld).toHaveBeenCalledTimes(1);
    });

    it("a stamp that failed can be run again", async () => {
      const deps = persistence();
      const result = await persistCompletedOnboarding(defaultSettings(), completeState(), now, deps,
        {}, undefined, null, { deferStamp: true });
      deps.saveSynced.mockRejectedValueOnce(new Error("offline"));
      await expect(result.stamp!()).rejects.toThrow("offline");
      await result.stamp!();
      expect(deps.openFoodWorld).toHaveBeenCalledTimes(1);
    });

    it("without deferStamp the profile write stamps as before and returns no stamp function", async () => {
      const deps = persistence();
      const result = await persistCompletedOnboarding(defaultSettings(), completeState(), now, deps);
      expect(result.stamp).toBeUndefined();
      expect(deps.saveSynced).toHaveBeenCalledTimes(1);
      expect(deps.saveSynced.mock.calls[0][4]).toBeUndefined();
    });

    it("the queued settings op of a deferred save carries no onboarded_at; the stamp op carries it alone", async () => {
      const onboardedAt = new Date(2026, 8, 19, 12, 0).toISOString();
      const settings = { ...defaultSettings(), sex: "female" as const, birthYear: 1996, heightCm: 165,
        weightKg: 60, activityLevel: "moderate" as const, goal: "recomp" as const, onboardedAt };
      await saveOnboardingSettings(settings, "complete", [], vi.fn(async () => undefined as never),
        () => 60, undefined, true);
      const first = (await allOps(h))[0].payload as Record<string, unknown>;
      expect(first.birth_year).toBe(1996);
      expect(first.onboarded_at ?? null).toBeNull();
      await saveOnboardingSettings(settings, "skip");
      const ops = await allOps(h);
      expect((ops[ops.length - 1].payload as Record<string, unknown>).onboarded_at).toBe(onboardedAt);
    });
  });
});
