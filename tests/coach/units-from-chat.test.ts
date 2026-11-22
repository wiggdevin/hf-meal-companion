/**
 * W060 (docs/specs/phase-12-coach-tools.md section 2): weight and height units from chat. A unit is
 * display only: `update_profile` carries `weightUnit` / `heightUnit`, the write queues one column
 * per unit key, no target is derived, and Undo puts the units back and nothing else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachActionSchema, coachActionWireSchema } from "@/lib/coach/actions";
import type { CoachAction } from "@/lib/coach/actions";
import { actionTitle } from "@/components/CoachActionCard";
import { actionLine } from "@/lib/coach/history";
import { defaultStore, __resetStoreCache, loadStore, saveStore } from "@/lib/store";
import { deriveTargetRevision } from "@/lib/profile/derive";
import { SETTINGS_CHANGED_EVENT } from "@/lib/settings-events";
import { resetTestAccount } from "@/tests/helpers/account";

const mocks = vi.hoisted(() => ({
  mutateUserSettings: vi.fn(),
  persistTargetSet: vi.fn(),
  restoreTarget: vi.fn(),
}));

vi.mock("@/lib/sync/outbox", () => ({
  mutateUserSettings: mocks.mutateUserSettings,
  USER_SETTINGS_KEY: "settings",
}));
vi.mock("@/lib/targets/client", async (original) => ({
  ...(await original<typeof import("@/lib/targets/client")>()),
  persistDerivedTargetRevisionSet: mocks.persistTargetSet,
  restoreTargetRevisionOnline: mocks.restoreTarget,
}));

import { applyUpdateProfile, undoSettingsAction } from "@/lib/coach/apply-profile";

type ProfileAction = Extract<CoachAction, { kind: "update_profile" }>;
const action = (fields: Partial<ProfileAction>): ProfileAction =>
  ({ kind: "update_profile", actionId: "u1", flagged: [], ...fields });

const PROFILE = { sex: "female" as const, birthYear: 1992, heightCm: 165, weightKg: 58.1,
  activityLevel: "moderate" as const, goal: "maintain" as const, trainingWeekdays: [1, 3, 4, 5] };
/** What the server holds for this account: phone B has already moved the weight on. */
const SERVER_ROW = { rev: 3, user_id: "u", height_cm: 165, weight_kg: 80, weight_unit: "lb",
  height_unit: "ft_in", birth_year: 1992, sex: "female", goal: "maintain" };

let ops: Record<string, unknown>[];
let events: number;

beforeEach(async () => {
  vi.clearAllMocks();
  await resetTestAccount();
  ops = [];
  mocks.mutateUserSettings.mockImplementation(async (_h, mutate) => {
    const out = mutate({ ...SERVER_ROW });
    ops.push(out.op as Record<string, unknown>);
    return out.result;
  });
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  __resetStoreCache();
  const store = defaultStore();
  const revision = { ...deriveTargetRevision({ settings: { ...store.settings, ...PROFILE },
    latestWeighInKg: null, today: "2026-09-18", trainingWeekdays: [1, 3, 4, 5] }),
    id: "00000000-0000-4000-8000-000000000009", revision: 8 };
  saveStore({ ...store, settings: { ...store.settings, ...PROFILE, activeTargetProfile: revision } },
    { silent: true });
  events = 0;
  globalThis.addEventListener = ((name: string) => { void name; }) as never;
  vi.stubGlobal("dispatchEvent", (event: Event) => { if (event.type === SETTINGS_CHANGED_EVENT) events += 1; return true; });
});

describe("the update_profile unit fields", () => {
  it("accepts a unit alone and refuses an unknown unit", () => {
    expect(coachActionSchema.safeParse({ kind: "update_profile", weightUnit: "kg" }).success).toBe(true);
    expect(coachActionSchema.safeParse({ kind: "update_profile", heightUnit: "cm" }).success).toBe(true);
    expect(coachActionSchema.safeParse({ kind: "update_profile", weightUnit: "stone" }).success).toBe(false);
    expect(coachActionSchema.safeParse({ kind: "update_profile", heightUnit: "in" }).success).toBe(false);
  });

  it("reads the units from the positional stringArgs, after sex, activity and goal", () => {
    const wire = coachActionWireSchema.safeParse({ kind: "update_profile",
      stringArgs: ["", "", "", "kg", "cm"] });
    expect(wire.success).toBe(true);
    if (wire.success) expect(wire.data).toEqual({ kind: "update_profile", weightUnit: "kg", heightUnit: "cm" });
  });

  it("titles a units-only card by its units and a mixed card as a profile update", () => {
    expect(actionTitle(action({ weightUnit: "kg" }))).toBe("Weight unit: kg");
    expect(actionTitle(action({ heightUnit: "cm" }))).toBe("Height unit: cm");
    expect(actionTitle(action({ weightUnit: "lb", heightUnit: "ft_in" })))
      .toBe("Weight unit: lb · Height unit: ft and in");
    expect(actionTitle(action({ weightUnit: "kg", goal: "recomp" }))).toBe("Profile updated");
  });

  it("writes the unit and its value into the thread history line", () => {
    expect(actionLine(action({ weightUnit: "kg" }))).toBe("[action: update_profile weightUnit → kg]");
  });
});

describe("applying and undoing a unit", () => {
  it("queues only the unit column, derives and writes no target, and announces the change", async () => {
    const result = await applyUpdateProfile(action({ weightUnit: "kg" }));
    expect(result.status).toBe("applied");
    expect(mocks.persistTargetSet).not.toHaveBeenCalled();
    expect(mocks.mutateUserSettings).toHaveBeenCalledTimes(1);
    // The payload is the server's current row with one key changed: phone B's weight is kept.
    const { rev: _rev, user_id: _user, ...stored } = SERVER_ROW;
    void _rev; void _user;
    expect(ops[0].payload).toEqual({ ...stored, weight_unit: "kg" });
    expect(loadStore().settings.weightUnit).toBe("kg");
    expect(loadStore().settings.weightKg).toBe(PROFILE.weightKg);
    expect(events).toBe(1);
    if (result.status !== "applied") throw new Error("not applied");
    expect(result.token).toMatchObject({ kind: "update_profile", fields: ["weightUnit"] });
  });

  it("Undo puts back that one unit, restores no revision and announces it", async () => {
    const result = await applyUpdateProfile(action({ heightUnit: "cm" }));
    if (result.status !== "applied" || result.token.kind !== "update_profile") throw new Error("token");
    ops.length = 0;
    await undoSettingsAction(result.token);
    expect(mocks.restoreTarget).not.toHaveBeenCalled();
    expect(mocks.persistTargetSet).not.toHaveBeenCalled();
    const { rev: _rev, user_id: _user, ...stored } = SERVER_ROW;
    void _rev; void _user;
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toEqual({ ...stored, height_unit: "ft_in" });
    expect(loadStore().settings.heightUnit ?? "ft_in").toBe("ft_in");
    expect(events).toBe(2);
  });

  it("a unit together with another profile field still writes the target", async () => {
    mocks.persistTargetSet.mockImplementation(async (input) => ({ revision: { ...deriveTargetRevision(input),
      id: "00000000-0000-4000-8000-000000000011", revision: 9 } }));
    await applyUpdateProfile(action({ weightUnit: "kg", goal: "recomp" }));
    expect(mocks.persistTargetSet).toHaveBeenCalledTimes(1);
    expect(loadStore().settings).toMatchObject({ weightUnit: "kg", goal: "recomp" });
    expect(events).toBe(1);
  });
});
