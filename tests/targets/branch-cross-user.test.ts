// tests/targets/branch-cross-user.test.ts  — [needs branch]
import { beforeAll, describe, expect, it } from "vitest";
import { defaultSettings } from "@/lib/store";
import { adminClient, createTestUsers, HAS_BRANCH, resetUser } from "@/tests/helpers/supabase";
import { seedFloorProfile } from "@/tests/helpers/floor-profile";
import { TargetBelowFloorError } from "@/lib/server/target-write-errors";
import { authorTargets, FloorViolationError, writeDerivedTargets } from "@/lib/server/targets";

const run = HAS_BRANCH ? describe : describe.skip;

run("cross-user denial and percent authority on a real branch", () => {
  let admin: ReturnType<typeof adminClient>;
  let users: Awaited<ReturnType<typeof createTestUsers>>;
  /** User A's own floor set — the only source of the numbers the authored write is checked against. */
  let floors: { proteinGMin: number; fatGMin: number };

  beforeAll(async () => {
    admin = adminClient();
    users = await createTestUsers();
    await resetUser(users.a.userId);
    await resetUser(users.b.userId);
    // D1 §5: the floor sequence reads the account's active revision and nothing
    // else — the ramp stage that used to supply 115 g of protein and 50 g of fat is deleted, and a
    // row-less account is refused with `targets_need_profile` (lib/server/targets.ts:195). Seed the
    // first revision through the same derived path onboarding uses, then assert against its floors.
    await seedFloorProfile(admin, users.a.userId, { birth_year: 1996, height_cm: 165, weight_kg: 60,
      sex: "female", goal: "recomp" });
    await writeDerivedTargets(users.a.client, users.a.userId, {
      settings: { ...defaultSettings(), sex: "female", birthYear: 1996, heightCm: 165,
        weightKg: 60, activityLevel: "moderate", goal: "recomp" },
      latestWeighInKg: null, today: "2026-09-11", trainingWeekdays: [1, 3, 4, 5],
    });
    const seeded = await admin.from("target_profiles").select("protein_g_min, fat_g_min")
      .eq("user_id", users.a.userId).single();
    expect(seeded.error).toBeNull();
    floors = { proteinGMin: Number(seeded.data?.protein_g_min),
      fatGMin: Number(seeded.data?.fat_g_min) };
    await admin.from("expenditure_estimates").insert({ user_id: users.a.userId,
      local_date: "2026-09-11", status: "estimating", tdee_kcal: 2250, confidence: 1,
      engine_version: "exp-1.0.0" });
    await admin.from("target_proposals").insert({ user_id: users.a.userId,
      week_start: "2026-10-05", status: "pending", proposed: {} });
  });

  it("shows user B nothing on either estimator table (criterion 13)", async () => {
    for (const table of ["expenditure_estimates", "target_proposals"]) {
      const { data } = await users.b.client.from(table).select("id");
      expect(data).toEqual([]);
    }
  });

  it("refuses user B's approve_target_proposal against user A's id", async () => {
    const { data, error } = await users.b.client.rpc("approve_target_proposal",
      { p_user_id: users.a.userId, p_proposal_id: "00000000-0000-0000-0000-000000000001" });
    expect(error ?? data).not.toEqual({ status: "approved" });
  });

  it("round-trips a percent profile server-side (criteria 10 and 11)", async () => {
    const out = await authorTargets(users.a.client, users.a.userId, { mode: "percent",
      effectiveFrom: "2026-09-14", kcalTrain: 2200, kcalRest: 1750,
      percent: { proteinPct: 31, fatPct: 30, carbPct: 39 } });
    const t = out.resolved.training;
    expect(Math.abs(4 * t.protein + 9 * t.fat + 4 * t.carbs - t.kcal)).toBeLessThanOrEqual(10);

    await expect(authorTargets(users.a.client, users.a.userId, { mode: "percent",
      effectiveFrom: "2026-09-15", kcalTrain: 2200, kcalRest: 1750,
      percent: { proteinPct: 40, fatPct: 20, carbPct: 40 } }))
      .rejects.toBeInstanceOf(FloorViolationError);
  });

  it("refuses numbers below the account's own floors and writes nothing (W060)", async () => {
    // The writer recomputes the floors from the account's profile. A grams set below them is
    // refused with the minimum, not silently raised (it used to be raised).
    const write = (proteinG: number, fatG: number, effectiveFrom: string) =>
      authorTargets(users.a.client, users.a.userId, { mode: "grams", effectiveFrom,
        kcalTrain: 2200, kcalRest: 1750, grams: { proteinG, fatG, carbG: 300 } });
    const fat = await write(floors.proteinGMin + 20, 30, "2026-09-16").catch((e: unknown) => e);
    expect(fat).toBeInstanceOf(TargetBelowFloorError);
    expect(fat).toMatchObject({ status: 422, floor: "fat", minimum: floors.fatGMin });
    const protein = await write(90, floors.fatGMin + 10, "2026-09-16").catch((e: unknown) => e);
    expect(protein).toBeInstanceOf(TargetBelowFloorError);
    expect(protein).toMatchObject({ status: 422, floor: "protein", minimum: floors.proteinGMin });
    expect(floors.proteinGMin).toBeGreaterThan(90);
    const { data } = await admin.from("target_profiles").select("id")
      .eq("user_id", users.a.userId).eq("effective_from", "2026-09-16");
    expect(data).toEqual([]);
  });
});
