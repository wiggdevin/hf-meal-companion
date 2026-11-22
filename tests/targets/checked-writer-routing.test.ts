// W060: every app write of a target revision goes through write_target_revision_checked, a refusal
// reaches the caller as its typed error, and the old writers are not called by app code.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { adminFake } from "@/tests/helpers/admin-fake";

vi.mock("@/lib/server/admin", async () => (await import("@/tests/helpers/admin-fake")).adminModule);
import {
  authorTargets, restoreTargetRevision, TargetBelowFloorError, writeDerivedTargets,
  writeDerivedTargetsIfActive, writeTargetRevisionSet,
} from "@/lib/server/targets";
import { decideProposal } from "@/lib/server/proposals";
import { defaultSettings } from "@/lib/store";
import { NO_HOLDS } from "@/lib/profile/rate-eligibility";
import type { TargetProfile } from "@/lib/api-types";

const PROFILE: TargetProfile = {
  id: "p1", user_id: "u1", effective_from: "2026-09-01", rev: 1,
  kcal_train: 2200, kcal_rest: 1750, authored_by: "user", mode: "grams",
  protein_g: 135, fat_g: 85, carb_g: 200, protein_pct: null, fat_pct: null,
  carb_pct: null, kcal_min: 1650, protein_g_min: 135, fat_g_min: 50,
  carb_g_min: 100, goal_rate_bp_week: 0, max_weekly_kcal_step: 150, notes: null,
};
const SETTINGS = { ...defaultSettings(), sex: "female" as const, birthYear: 1996, heightCm: 165,
  weightKg: 60, activityLevel: "moderate" as const, goal: "recomp" as const,
  trainingWeekdays: [1, 3, 4, 5] };
const DERIVE = { settings: SETTINGS, latestWeighInKg: 60, today: "2026-09-19",
  trainingWeekdays: [1, 3, 4, 5], eligibility: NO_HOLDS };

type Answer = { data?: unknown; error?: unknown };
function clientWith(answer: (name: string, args: Record<string, unknown>) => Answer) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) =>
    ({ data: null, error: null, ...answer(name, args) }));
  const noRows = { select: () => ({ eq: () => Object.assign(
    Promise.resolve({ data: [], error: null }), {
      maybeSingle: async () => ({ data: { weight_kg: 60, birth_year: 1990 }, error: null }),
      eq: () => ({ maybeSingle: async () => ({ data: PROFILE, error: null }) }),
      lte: () => ({ order: () => ({ order: () => ({ limit: () => ({
        maybeSingle: async () => ({ data: PROFILE, error: null }) }) }) }) }),
    }) }) };
  const client = { from: () => noRows, rpc } as never;
  adminFake.client = client;
  return { client, rpc };
}
const floorRefusal = { error: { code: "SF001", message: "below_floor",
  details: JSON.stringify({ floor: "kcal", dayType: "training", minimum: 1430 }) } };
const sentRow = (rpc: ReturnType<typeof vi.fn>) =>
  (rpc.mock.calls.at(-1)?.[1] as { p_row: Record<string, unknown> }).p_row;

describe("derive writes", () => {
  it("surfaces a refusal as TargetBelowFloorError and sends the floor profile", async () => {
    const { client, rpc } = clientWith(() => floorRefusal);
    await expect(writeDerivedTargets(client, "u1", DERIVE)).rejects.toBeInstanceOf(TargetBelowFloorError);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("write_target_revision_checked");
    expect(sentRow(rpc).floor_profile).toEqual({ sex: "female", birth_year: 1996, height_cm: 165,
      weight_kg: 60, goal: "recomp" });
  });

  it("writes an Undo pair in one call to the checked writer, the new row first", async () => {
    const { client, rpc } = clientWith(() => ({ error: { code: "SF002", message: "profile_required" } }));
    await expect(writeTargetRevisionSet(client, "u1",
      { operation: "derive", input: DERIVE, requestId: "00000000-0000-4000-8000-0000000000aa" },
      { operation: "derive", input: { ...DERIVE, today: "2026-09-18" },
        requestId: "00000000-0000-4000-8000-0000000000bb" }))
      .rejects.toMatchObject({ status: 409, code: "profile_required" });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, Record<string, unknown>>];
    expect(name).toBe("write_target_revision_checked");
    expect(args.p_row.request_id).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(args.p_predecessor.request_id).toBe("00000000-0000-4000-8000-0000000000bb");
  });

  it("the conditional write goes to the checked variant and keeps its conflict answer", async () => {
    const { client, rpc } = clientWith(() => ({ data: { conflict: true, active_id: "p1" } }));
    await expect(writeDerivedTargetsIfActive(client, "u1", DERIVE, "p0", 7)).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith("write_target_revision_if_active_checked", expect.objectContaining({
      p_expected_id: "p0", p_expected_settings_rev: 7 }));
    rpc.mockResolvedValueOnce({ data: null, ...floorRefusal });
    await expect(writeDerivedTargetsIfActive(client, "u1", DERIVE, "p1", 7))
      .rejects.toBeInstanceOf(TargetBelowFloorError);
  });
});

describe("authored targets", () => {
  const grams = (kcalTrain: number, kcalRest: number, g = { proteinG: 135, fatG: 85, carbG: 200 }) =>
    ({ mode: "grams" as const, effectiveFrom: "2026-09-14", kcalTrain, kcalRest, grams: g });

  it("never replaces the calories: a low day goes to the writer as sent", async () => {
    const { client, rpc } = clientWith(() => floorRefusal);
    await expect(authorTargets(client, "u1", grams(1100, 1000, { proteinG: 100, fatG: 40, carbG: 100 })))
      .rejects.toBeInstanceOf(TargetBelowFloorError);
    const row = sentRow(rpc);
    expect(row.training_macros).toMatchObject({ kcal: 1100, protein: 100, fat: 40 });
    expect(row.rest_macros).toMatchObject({ kcal: 1000, protein: 100, fat: 40 });
    expect(row).toMatchObject({ pin_training_kcal: 1100, pin_rest_kcal: 1000, pin_protein_g: 100 });
    expect(rpc.mock.calls[0][0]).toBe("write_target_revision_checked");
  });

  it("refuses a day that leaves negative carbohydrate with invalid_macros and writes nothing", async () => {
    const { client, rpc } = clientWith(() => ({}));
    await expect(authorTargets(client, "u1", grams(2200, 900))).rejects.toMatchObject({
      status: 422, code: "invalid_macros",
      message: "Rest-day calories are too low for this protein and fat. "
        + "Raise them or lower protein or fat." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the typed carbohydrate on the training day and builds the rest day from its own calories", async () => {
    const { client, rpc } = clientWith((_n, args) => ({ data: {
      ...PROFILE, id: "p2", rev: 2, ...(args.p_row as object) } }));
    await authorTargets(client, "u1", grams(2200, 1750, { proteinG: 135, fatG: 85, carbG: 224 }));
    expect(sentRow(rpc).training_macros).toEqual({ kcal: 2200, protein: 135, carbs: 224, fat: 85 });
    expect(sentRow(rpc).rest_macros).toEqual({ kcal: 1750, protein: 135, carbs: 111, fat: 85 });
  });
});

describe("restore and approval", () => {
  it("a restore below today's floor is refused by the writer, not raised", async () => {
    const { client, rpc } = clientWith(() => floorRefusal);
    await expect(restoreTargetRevision(client, "u1", "p1", "2026-09-20")).rejects.toThrow();
    // The restored row is the stored revision as it was (no row was written).
    expect(rpc).not.toHaveBeenCalledWith("write_target_revision", expect.anything());
  });

  it("a proposal below the floor is refused with the floor's message", async () => {
    const { client, rpc } = clientWith(() => floorRefusal);
    await expect(decideProposal(client, "u1", "pr1", { decision: "approve", expectedStatus: "pending" }))
      .rejects.toBeInstanceOf(TargetBelowFloorError);
    expect(rpc).toHaveBeenCalledWith("approve_target_proposal", { p_user_id: "u1", p_proposal_id: "pr1" });
  });
});

describe("the old writers are not called by app code", () => {
  const roots = ["app", "lib", "components"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  };
  for (const root of roots) walk(path.join(process.cwd(), root));
  /** The code of a file: comments removed, so only a string that is passed to rpc() can match. */
  const code = (file: string) => readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("names no old target writer as an RPC", () => {
    const old = /["'`](write_target_revision|write_target_revision_if_active|write_target_revision_pair)["'`]/;
    expect(files.filter((f) => old.test(code(f)))).toEqual([]);
  });

  it("only target-writes.ts calls a target writer or the approval", () => {
    const rpcName = /["'`](write_target_revision\w*|approve_target_proposal)["'`]/;
    const hits = files.filter((f) => rpcName.test(code(f)))
      .map((f) => path.relative(process.cwd(), f));
    expect(hits).toEqual(["lib/server/target-writes.ts"]);
  });
});
