// W060 / Phase 12: write_target_revision_checked, account_floor, account_body_mass_kg and the
// checked proposal approval, against the real database (local test stack only).
// Migration: supabase/migrations/20270109100000_w060_checked_target_writer.sql.
import "../tenancy/local-only";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTestUsers, HAS_BRANCH, HAS_DB, resetUser, runSql } from "../helpers/supabase";
import { deriveTargetRevision } from "@/lib/profile/derive";
import { macroMinimumKcal, proteinBasisKg } from "@/lib/profile/rate-goal";
import type { Settings } from "@/lib/types";

const run = HAS_BRANCH ? describe : describe.skip;

type Day = { kcal: number; protein: number; carbs: number; fat: number };
const day = (protein: number, carbs: number, fat: number): Day =>
  ({ kcal: 4 * protein + 4 * carbs + 9 * fat, protein, carbs, fat });

/** The persona of write-if-active-db.test.ts: 170.2 cm, 72.575 kg, recomp: protein 145, kcal 1,430. */
const AT_MINIMUM = { training: day(145, 100, 50), rest: day(145, 100, 50) };

function row(
  over: Record<string, unknown> = {}, days: { training: Day; rest: Day } = AT_MINIMUM,
): Record<string, unknown> {
  return {
    effective_from: "2026-10-03", target_source: "derived", formula_name: "profile-energy-v1",
    training_macros: days.training, rest_macros: days.rest,
    pin_training_kcal: null, pin_rest_kcal: null, pin_protein_g: null,
    input_weight_kg: 72.575, input_weight_source: "onboarding", input_training_weekdays: [1, 3, 4, 5],
    input_activity_level: "moderate", input_goal: "recomp", goal_rate_bp_week: 0,
    ...over,
  };
}

const PROFILE = {
  time_zone: "America/Denver", height_cm: 170.2, birth_year: 1968, sex: "female",
  weight_kg: 72.575, activity_level: "moderate", goal: "recomp", training_weekdays: [1, 3, 4, 5],
};

run("write_target_revision_checked (database)", () => {
  let client: SupabaseClient;
  let admin: SupabaseClient;
  let userId = "";

  const checked = (p_row: Record<string, unknown>, p_predecessor: Record<string, unknown> | null = null) =>
    admin.rpc("write_target_revision_checked",
      { p_user_id: userId, p_row, ...(p_predecessor ? { p_predecessor } : {}) });
  const rows = async () => {
    const { data } = await client.from("target_profiles").select("*").eq("user_id", userId).order("rev");
    return data ?? [];
  };
  const seedProfile = async (over: Record<string, unknown> = {}) => {
    const { error } = await admin.from("user_settings").upsert({
      user_id: userId, first_opened_at: "2026-09-20T17:00:00Z", onboarded_at: "2026-09-22T11:12:00Z",
      ...PROFILE, ...over,
    });
    expect(error).toBeNull();
  };
  const sample = async (kind: "manual" | "oura", value: number, unit: string, start: string) => {
    const { data: src } = await admin.from("health_sources").select("id")
      .eq("user_id", userId).eq("kind", kind).is("revoked_at", null).maybeSingle();
    let sourceId = (src as { id: string } | null)?.id;
    if (!sourceId) {
      const made = await admin.from("health_sources")
        .insert({ user_id: userId, kind, device_label: kind }).select("id").single();
      expect(made.error).toBeNull();
      sourceId = (made.data as { id: string }).id;
    }
    const at = new Date(start);
    const ins = await admin.from("health_samples").insert({
      user_id: userId, source_id: sourceId, type: "body_mass", value, unit,
      vendor_sample_id: `${kind}-${start}-${value}`,
      start_time: at.toISOString(), end_time: new Date(at.getTime() + 1000).toISOString(),
      tz: "America/Denver",
    }).select("id").single();
    expect(ins.error).toBeNull();
    return (ins.data as { id: string }).id;
  };
  const kg = async (date: string | null) => {
    const { data, error } = await admin.rpc("account_body_mass_kg",
      { p_user_id: userId, ...(date ? { p_effective_date: date } : {}) });
    expect(error).toBeNull();
    return (data as { kg: number | null; sample_id: string | null }[])[0];
  };

  async function wipe() {
    await admin.from("health_samples").delete().eq("user_id", userId);
    await admin.from("health_sources").delete().eq("user_id", userId);
    await admin.from("constraint_profiles").delete().eq("user_id", userId);
    await resetUser(userId);
  }

  beforeAll(async () => {
    const users = await createTestUsers();
    client = users.a.client;
    admin = users.admin;
    userId = users.a.userId;
    await wipe();
  });
  beforeEach(async () => { await wipe(); await seedProfile(); });
  afterAll(async () => { if (userId) await wipe(); });

  describe("floors", () => {
    it("refuses kcal below the minimum, names the floor, writes nothing", async () => {
      const out = await checked(row({}, { training: day(145, 90, 50), rest: AT_MINIMUM.rest }));
      expect(out.error?.code).toBe("SF001");
      expect(JSON.parse(out.error?.details ?? "{}"))
        .toEqual({ floor: "kcal", dayType: "training", minimum: 1430 });
      expect(await rows()).toHaveLength(0);
    });

    it("refuses fat below 50 g and protein below the minimum, first failing value only", async () => {
      const fat = await checked(row({}, { training: AT_MINIMUM.training, rest: day(145, 200, 40) }));
      expect(JSON.parse(fat.error?.details ?? "{}"))
        .toEqual({ floor: "fat", dayType: "rest", minimum: 50 });
      const protein = await checked(row({}, { training: day(120, 200, 60), rest: AT_MINIMUM.rest }));
      expect(protein.error?.code).toBe("SF001");
      expect(JSON.parse(protein.error?.details ?? "{}"))
        .toEqual({ floor: "protein", dayType: "training", minimum: 145 });
      expect(await rows()).toHaveLength(0);
    });

    it("saves at the minima and stores the three minima it computed, ignoring the caller's", async () => {
      const out = await checked(row({ kcal_min: 1200, protein_g_min: 10, fat_g_min: 1,
        kcal_min_source: "legacy_default" }));
      expect(out.error).toBeNull();
      expect(out.data).toMatchObject({ kcal_min: 1430, protein_g_min: 145, fat_g_min: 50,
        carb_g_min: 100, kcal_min_source: "macro_minimum", kcal_train: 1430 });
      expect(await rows()).toHaveLength(1);
    });

    it("refuses a pin below the minimum even when the resolved day sits above it", async () => {
      const kcal = await checked(row({ pin_training_kcal: 1300 },
        { training: day(145, 150, 50), rest: day(145, 150, 50) }));
      expect(JSON.parse(kcal.error?.details ?? "{}"))
        .toEqual({ floor: "kcal", dayType: "training", minimum: 1430 });
      const rest = await checked(row({ pin_rest_kcal: 1300 }));
      expect(JSON.parse(rest.error?.details ?? "{}"))
        .toEqual({ floor: "kcal", dayType: "rest", minimum: 1430 });
      const protein = await checked(row({ pin_protein_g: 100 }));
      expect(JSON.parse(protein.error?.details ?? "{}"))
        .toEqual({ floor: "protein", dayType: "training", minimum: 145 });
      expect(await rows()).toHaveLength(0);
    });

    it("takes standard protein (0.8 g/kg) under a kidney hold", async () => {
      const lowProtein = { training: day(60, 100, 50), rest: day(60, 100, 50) };
      expect((await checked(row({}, lowProtein))).error?.code).toBe("SF001");
      const { error: c } = await admin.from("constraint_profiles")
        .upsert({ user_id: userId, conditions: ["Chronic kidney disease"] });
      expect(c).toBeNull();
      const out = await checked(row({}, lowProtein));
      expect(out.error).toBeNull();
      // 0.8 x 72.575 = 58.06 -> 58 g; 4*58 + 450 + 400.
      expect(out.data).toMatchObject({ protein_g_min: 58, kcal_min: 1082 });
    });

    it("takes standard protein for the ckd dietary profile too", async () => {
      const { error: d } = await admin.from("user_dietary_profiles").insert({ user_id: userId,
        profile_id: "ckd", source: "user_stated", confirmed_at: "2026-10-01T00:00:00Z" });
      expect(d).toBeNull();
      const out = await checked(row({}, { training: day(60, 100, 50), rest: day(60, 100, 50) }));
      expect(out.error).toBeNull();
    });
  });

  describe("macros", () => {
    it("refuses calories that do not match the macros by more than 9 kcal", async () => {
      const out = await checked(row({}, {
        training: { kcal: 2000, protein: 150, carbs: 200, fat: 80 }, rest: AT_MINIMUM.rest }));
      expect(out.error?.code).toBe("SF004");
      expect(JSON.parse(out.error?.details ?? "{}")).toMatchObject(
        { reason: "kcal_mismatch", dayType: "training", kcal: 2000, macroKcal: 2120 });
      expect(await rows()).toHaveLength(0);
    });

    it("stores a row within 9 kcal as sent", async () => {
      const out = await checked(row({}, {
        training: { kcal: 1438, protein: 145, carbs: 100, fat: 50 }, rest: AT_MINIMUM.rest }));
      expect(out.error).toBeNull();
      expect(out.data).toMatchObject({ kcal_train: 1438 });
    });

    it("refuses a negative macro", async () => {
      const out = await checked(row({}, {
        training: AT_MINIMUM.training, rest: { kcal: 1500, protein: 200, carbs: -50, fat: 100 } }));
      expect(out.error?.code).toBe("SF004");
      expect(JSON.parse(out.error?.details ?? "{}"))
        .toMatchObject({ reason: "negative_macro", dayType: "rest" });
    });
  });

  describe("profile", () => {
    it("raises profile_required (SF002) with no stored profile and none sent", async () => {
      await resetUser(userId);
      const out = await checked(row());
      expect(out.error?.code).toBe("SF002");
      expect(await rows()).toHaveLength(0);
    });

    it("raises profile_required when the stored profile lacks a field the floor needs", async () => {
      await seedProfile({ height_cm: null });
      expect((await checked(row())).error?.code).toBe("SF002");
    });

    it("uses the settings the route sends as floor_profile only when none are stored", async () => {
      await resetUser(userId);
      const floorProfile = { sex: "female", birth_year: 1968, height_cm: 170.2, weight_kg: 72.575,
        goal: "recomp" };
      const out = await checked(row({ floor_profile: floorProfile }));
      expect(out.error).toBeNull();
      expect(out.data).toMatchObject({ protein_g_min: 145, kcal_min: 1430 });
      // A stored profile wins: 200 cm and 100 kg give a higher minimum than the sent 170 cm persona
      // (protein 200 g, so kcal 4 x 200 + 850 = 1,650; kcal is checked first).
      await resetUser(userId);
      await seedProfile({ height_cm: 200, weight_kg: 100 });
      const stored = await checked(row({ floor_profile: floorProfile }));
      expect(JSON.parse(stored.error?.details ?? "{}"))
        .toEqual({ floor: "kcal", dayType: "training", minimum: 1650 });
    });
  });

  describe("idempotency", () => {
    it("returns the stored revision for a repeated request_id, even when the profile is gone", async () => {
      const requestId = crypto.randomUUID();
      const first = await checked(row({ request_id: requestId }));
      expect(first.error).toBeNull();
      await resetUserSettingsOnly();
      const replay = await checked(row({ request_id: requestId }));
      expect(replay.error).toBeNull();
      expect((replay.data as { id: string }).id).toBe((first.data as { id: string }).id);
      expect(await rows()).toHaveLength(1);
    });

    async function resetUserSettingsOnly() {
      const { error } = await admin.from("user_settings").delete().eq("user_id", userId);
      expect(error).toBeNull();
    }
  });

  describe("pair write", () => {
    it("checks p_row only: a predecessor below today's floor is stored, in the pair shape", async () => {
      const lowPredecessor = row({ effective_from: "2026-10-02", request_id: crypto.randomUUID() },
        { training: day(100, 60, 30), rest: day(100, 60, 30) });
      const out = await checked(row({ request_id: crypto.randomUUID() }), lowPredecessor);
      expect(out.error).toBeNull();
      const data = out.data as { predecessor: { rev: number; kcal_train: number };
        revision: { rev: number; kcal_train: number } };
      expect(data.predecessor).toMatchObject({ kcal_train: 4 * 100 + 4 * 60 + 9 * 30, rev: 1 });
      expect(data.revision).toMatchObject({ kcal_train: 1430, rev: 2 });
    });

    it("refuses a row below the floor and writes neither half", async () => {
      const out = await checked(row({ request_id: crypto.randomUUID() },
        { training: day(145, 80, 50), rest: AT_MINIMUM.rest }),
      row({ effective_from: "2026-10-02", request_id: crypto.randomUUID() }));
      expect(out.error?.code).toBe("SF001");
      expect(await rows()).toHaveLength(0);
    });

    it("replays both halves of a pair", async () => {
      const [pr, rr] = [crypto.randomUUID(), crypto.randomUUID()];
      const first = await checked(row({ request_id: rr }), row({ effective_from: "2026-10-02", request_id: pr }));
      const replay = await checked(row({ request_id: rr }), row({ effective_from: "2026-10-02", request_id: pr }));
      expect(replay.data).toEqual(first.data);
      expect(await rows()).toHaveLength(2);
    });
  });

  describe("if-active variant", () => {
    const ifActive = (p_row: Record<string, unknown>, expected: string | null) =>
      admin.rpc("write_target_revision_if_active_checked",
        { p_user_id: userId, p_row, p_expected_id: expected });

    it("writes when the expectation holds, conflicts when stale, refuses below the floor", async () => {
      const first = await ifActive(row({ effective_from: "2026-09-22" }), null);
      expect(first.error).toBeNull();
      const firstId = (first.data as { id: string }).id;
      const stale = await ifActive(row({ effective_from: "2026-10-03" }), null);
      expect(stale.data).toEqual({ conflict: true, active_id: firstId });
      const low = await ifActive(row({ effective_from: "2026-10-03" },
        { training: day(145, 80, 50), rest: AT_MINIMUM.rest }), firstId);
      expect(low.error?.code).toBe("SF001");
      expect(await rows()).toHaveLength(1);
      const ok = await ifActive(row({ effective_from: "2026-10-03" }), firstId);
      expect(ok.error).toBeNull();
      expect(ok.data).toMatchObject({ kcal_min_source: "macro_minimum", rev: 2 });
    });
  });

  describe("account_body_mass_kg", () => {
    it("falls back to the profile weight with no sample, with a null sample id", async () => {
      expect(await kg("2026-10-03")).toEqual({ kg: 72.575, sample_id: null });
    });

    it("converts pounds, ignores a future-dated sample, and the latest date wins", async () => {
      await sample("manual", 160, "lb", "2026-10-01T15:00:00Z");
      await sample("manual", 100, "kg", "2026-10-09T15:00:00Z");
      const out = await kg("2026-10-03");
      expect(out.kg).toBeCloseTo(72.575, 3);
      expect(out.sample_id).not.toBeNull();
      expect((await kg("2026-10-09")).kg).toBe(100);
    });

    it("a device sample beats a manual one on the same local day, and the last of the day wins", async () => {
      await sample("manual", 80, "kg", "2026-10-02T20:00:00Z");
      await sample("oura", 71, "kg", "2026-10-02T14:00:00Z");
      await sample("oura", 70.5, "kg", "2026-10-02T16:00:00Z");
      expect((await kg("2026-10-03")).kg).toBe(70.5);
    });

    it("with a null date uses the account's local today", async () => {
      await sample("manual", 66, "kg", "2026-01-01T15:00:00Z");
      expect((await kg(null)).kg).toBe(66);
    });

    it("the checked writer takes the floor from the latest weigh-in, not the profile weight", async () => {
      await sample("manual", 100, "kg", "2026-10-02T15:00:00Z");
      const out = await checked(row());
      // 100 kg at 170.2 cm: basis 86.9 kg, protein 174 g, kcal 4 x 174 + 850 = 1,546 (not 1,430).
      expect(JSON.parse(out.error?.details ?? "{}"))
        .toEqual({ floor: "kcal", dayType: "training", minimum: 1546 });
    });
  });

  describe("floor parity with the TypeScript rule", () => {
    const personas: { goal: Settings["goal"]; height: number; weight: number }[] = [
      { goal: "recomp", height: 170.2, weight: 72.575 }, { goal: "lose_fat", height: 160, weight: 95 },
      { goal: "lose_fat", height: 190, weight: 140 }, { goal: "gain_muscle", height: 175, weight: 68.25 },
      { goal: "maintain", height: 152.4, weight: 49.9 }, { goal: "recomp", height: 183, weight: 70.25 },
      { goal: "maintain", height: 168.5, weight: 105.5 }, { goal: "gain_muscle", height: 201, weight: 120 },
    ];
    for (const kidney of [false, true]) {
      it.skipIf(!HAS_DB)(`matches deriveTargetRevision floors (${kidney ? "kidney hold" : "no hold"})`, async () => {
        await admin.from("constraint_profiles").delete().eq("user_id", userId);
        if (kidney) {
          await admin.from("constraint_profiles").upsert({ user_id: userId, conditions: ["kidney"] });
        }
        for (const p of personas) {
          await seedProfile({ height_cm: p.height, goal: p.goal, weight_kg: p.weight });
          const settings = {
            sex: "female", birthYear: 1980, heightCm: p.height, weightKg: p.weight, bodyFatPct: null,
            bodyFatSource: null, bodyFatMeasuredOn: null, activityLevel: "moderate", goal: p.goal,
            goalRateBpWeek: 0, trainingKcal: null, restKcal: null, proteinG: null,
            activeTargetProfile: null,
          } as unknown as Settings;
          const ts = deriveTargetRevision({ settings, latestWeighInKg: null, today: "2026-10-03",
            trainingWeekdays: [1, 3, 4, 5],
            eligibility: { holds: kidney ? ["kidney"] : [], minor: false } }).floors;
          const sql = runSql(`select protein_g_min, fat_g_min, kcal_min from account_floor('${userId}', ${p.weight})`)
            .split("|").map(Number);
          expect(sql, JSON.stringify(p)).toEqual([ts.proteinGMin, ts.fatGMin, ts.kcalMin]);
          expect(ts.kcalMin).toBe(macroMinimumKcal({ proteinGMin: ts.proteinGMin, fatGMin: 50, carbGMin: 100 }));
          if (!kidney && p.goal !== "lose_fat" && p.goal !== "recomp") {
            expect(ts.proteinGMin).toBe(Math.round(proteinBasisKg(p.weight, p.height) * 1.8));
          }
        }
      });
    }
  });

  describe("privileges", () => {
    it("authenticated and anon cannot call the checked writers or the weight and floor helpers", async () => {
      const calls: [string, Record<string, unknown>][] = [
        ["write_target_revision_checked", { p_user_id: userId, p_row: row() }],
        ["write_target_revision_if_active_checked",
          { p_user_id: userId, p_row: row(), p_expected_id: null }],
        ["account_floor", { p_user_id: userId, p_weight_kg: 70 }],
        ["account_body_mass_kg", { p_user_id: userId }],
      ];
      const { anonClient } = await import("../helpers/supabase");
      for (const [fn, args] of calls) {
        for (const who of [client, anonClient()]) {
          const out = await who.rpc(fn, args);
          expect(out.error?.code, fn).toBe("42501");
        }
      }
      expect(await rows()).toHaveLength(0);
    });
  });
});

// Proposal approval writes through the checked writer: a refusal leaves the proposal pending.
run("approve_target_proposal through the checked writer (database)", () => {
  let client: SupabaseClient;
  let admin: SupabaseClient;
  let userId = "";

  async function proposal(proposed: Record<string, unknown>): Promise<string> {
    const made = await admin.from("target_proposals").insert({
      user_id: userId, status: "pending", week_start: "2026-09-28", proposed,
    } as never).select("id").single();
    expect(made.error).toBeNull();
    return (made.data as { id: string }).id;
  }

  beforeAll(async () => {
    const users = await createTestUsers();
    client = users.a.client; admin = users.admin; userId = users.a.userId;
    await resetUser(userId);
  });
  beforeEach(async () => {
    await resetUser(userId);
    await admin.from("user_settings").upsert({ user_id: userId,
      first_opened_at: "2026-09-20T17:00:00Z", ...PROFILE });
  });
  afterAll(async () => { if (userId) await resetUser(userId); });

  it("approves a proposal at the minima, stamped with the computed floors", async () => {
    const id = await proposal({ kcalTrain: 1430, kcalRest: 1430, proteinG: 145, fatG: 50, carbG: 100 });
    const out = await admin.rpc("approve_target_proposal", { p_user_id: userId, p_proposal_id: id });
    expect(out.error).toBeNull();
    expect(out.data).toMatchObject({ status: "approved",
      profile: { kcal_min: 1430, kcal_min_source: "macro_minimum" } });
  });

  it("refuses a proposal below the floor and leaves it pending", async () => {
    const id = await proposal({ kcalTrain: 1340, kcalRest: 1340, proteinG: 145, fatG: 50, carbG: 78 });
    const out = await admin.rpc("approve_target_proposal", { p_user_id: userId, p_proposal_id: id });
    expect(out.error?.code).toBe("SF001");
    const { data } = await client.from("target_proposals").select("status").eq("id", id).single();
    expect(data?.status).toBe("pending");
    const { count } = await client.from("target_profiles")
      .select("id", { count: "exact", head: true }).eq("user_id", userId);
    expect(count).toBe(0);
  });
});
