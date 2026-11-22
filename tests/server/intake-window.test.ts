import { describe, expect, it } from "vitest";
import { readIntakeWindow, recentRecordedDates } from "@/lib/server/intake-window";

type Rows = Record<string, unknown>[];
type Answer = Rows | Error | "hang";

/**
 * A postgrest double with `abortSignal`: each table answers rows, an error, or hangs until its
 * signal aborts. It records every read and the signal each one was bound to.
 */
function client(tables: Record<string, Answer>) {
  const reads: { table: string; signal: AbortSignal | null; filters: [string, string, unknown][] }[] = [];
  const from = (table: string) => {
    const read = { table, signal: null as AbortSignal | null, filters: [] as [string, string, unknown][] };
    reads.push(read);
    const answer = (): Promise<{ data: unknown; error: unknown }> => {
      const value = tables[table] ?? [];
      if (value instanceof Error) return Promise.resolve({ data: null, error: value });
      if (value === "hang") {
        return new Promise((_, reject) => {
          const signal = read.signal;
          if (!signal) return;
          if (signal.aborted) reject(signal.reason);
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      const rows = value.filter((row) => read.filters.every(([op, column, wanted]) => {
        if (!(column in row)) return true;
        const have = String(row[column]);
        if (op === "gte") return have >= String(wanted);
        if (op === "lte") return have <= String(wanted);
        if (op === "in") return (wanted as unknown[]).map(String).includes(have);
        return true;
      }));
      return Promise.resolve({ data: rows, error: null });
    };
    const chain: Record<string, unknown> = {};
    const filter = (op: string) => (column: string, value: unknown) => {
      read.filters.push([op, column, value]);
      return chain;
    };
    Object.assign(chain, {
      select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
      range: () => chain, gte: filter("gte"), lte: filter("lte"), in: filter("in"),
      abortSignal: (signal: AbortSignal) => { read.signal = signal; return chain; },
      maybeSingle: async () => {
        const { data, error } = await answer();
        return { data: Array.isArray(data) ? data[0] ?? null : null, error };
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        answer().then(resolve, reject),
    });
    return chain;
  };
  return { admin: { from } as never, reads };
}

const PROFILE = {
  id: "t-1", user_id: "u", effective_from: "2026-09-01", rev: 1, kcal_train: 2200, kcal_rest: 1800,
  authored_by: "user", mode: "grams", protein_g: 120, fat_g: 80, carb_g: 250,
  protein_pct: null, fat_pct: null, carb_pct: null, kcal_min: 1200, protein_g_min: 120, fat_g_min: 50,
  carb_g_min: 0, goal_rate_bp_week: 0, max_weekly_kcal_step: 150, notes: null, target_source: "derived",
  training_macros: { kcal: 2200, protein: 120, carbs: 250, fat: 80 },
  rest_macros: { kcal: 1800, protein: 120, carbs: 150, fat: 80 },
  pin_training_kcal: null, pin_rest_kcal: null, pin_protein_g: null, input_weight_kg: 60,
  input_weight_source: "weigh-in", input_training_weekdays: [1, 3, 5], input_activity_level: "moderate",
  input_goal: "recomp", formula_name: "profile-energy-v1",
};

const entry = (date: string, protein = 80) => ({
  id: `e-${date}`, local_date: date, slot: "meal-1",
  log_items: [{ seq: 0, grams: 100, food_ref_id: `f-${date}`, nutrition_partial: false,
    snapshot: { energy_kcal_calc: { amount: 1000 }, protein: { amount: protein },
      carbohydrate: { amount: 100 }, fat_total: { amount: 30 } } }],
});

const mark = (at: string, consumed?: unknown) => ({
  eaten_at: at, changed_at: at, ...(consumed ? { consumed } : {}),
});

describe("readIntakeWindow", () => {
  it("charts a recipe-only day as measured and an undescribed eaten slot as a blank floor", async () => {
    const recipe = {
      baseMealId: "recipe:chili-0001", title: "Chili",
      components: [{ name: "Chili", qty: 1, unit: "whole", role: "free",
        macros: { kcal: 640, protein: 42, carbs: 55, fat: 21 } }],
    };
    const { admin } = client({
      log_entries: [entry("2026-09-14")],
      plan_days: [
        { local_date: "2026-09-15", eaten_slots: { "meal-2": mark("2026-09-15T18:00:00Z", recipe) } },
        { local_date: "2026-09-16", eaten_slots: { "meal-1": mark("2026-09-16T12:00:00Z") } },
        // A plan row with nothing eaten records nothing: not a charted day.
        { local_date: "2026-09-17", eaten_slots: {} },
      ],
      target_profiles: [PROFILE],
    });

    const days = await readIntakeWindow(admin, "u", { from: "2026-09-13", to: "2026-09-19" },
      { today: "2026-09-20" });

    expect(days.map((day) => day.date)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(days[1].protein).toEqual({ value: 42, partial: false });
    expect(days[2].protein).toEqual({ value: null, partial: true });
    expect(days[0].target).toMatchObject({ protein: 120 });
  });

  it("marks a day at or after today a floor until it is marked complete", async () => {
    const { admin } = client({
      log_entries: [entry("2026-09-18"), entry("2026-09-19"), entry("2026-09-20")],
      plan_days: [{ local_date: "2026-09-20", day_complete_at: "2026-09-20T21:00:00Z" }],
      target_profiles: [PROFILE],
    });

    const days = await readIntakeWindow(admin, "u", { from: "2026-09-18", to: "2026-09-20" },
      { today: "2026-09-19" });

    expect(days.map((day) => [day.date, day.kcal.partial])).toEqual([
      ["2026-09-18", false], ["2026-09-19", true], ["2026-09-20", false],
    ]);
  });

  it("reads only the listed dates in one batch per table", async () => {
    const { admin, reads } = client({
      log_entries: [entry("2026-09-10"), entry("2026-09-12"), entry("2026-09-14")],
      target_profiles: [PROFILE],
    });

    const days = await readIntakeWindow(admin, "u", { dates: ["2026-09-10", "2026-09-14"] },
      { today: "2026-09-19" });

    expect(days.map((day) => day.date)).toEqual(["2026-09-10", "2026-09-14"]);
    expect(reads.filter((read) => read.table === "log_entries")).toHaveLength(1);
    expect(reads.filter((read) => read.table === "plan_days")).toHaveLength(1);
    expect(reads.find((read) => read.table === "target_profiles")?.filters)
      .toContainEqual(["lte", "effective_from", "2026-09-14"]);
  });

  it("fails on the first read error and aborts the reads still running", async () => {
    const failure = new Error("log_entries down");
    const { admin, reads } = client({ log_entries: failure, plan_days: "hang", target_profiles: "hang" });

    await expect(readIntakeWindow(admin, "u", { from: "2026-09-13", to: "2026-09-19" },
      { today: "2026-09-19" })).rejects.toBe(failure);
    const plan = reads.find((read) => read.table === "plan_days");
    expect(plan?.signal?.aborted).toBe(true);
  });

  it("stops every read when the caller's signal aborts", async () => {
    const { admin, reads } = client({ log_entries: "hang", plan_days: "hang", target_profiles: "hang" });
    const caller = new AbortController();

    const pending = readIntakeWindow(admin, "u", { from: "2026-09-13", to: "2026-09-19" },
      { today: "2026-09-19", signal: caller.signal });
    caller.abort(new Error("phone left"));

    await expect(pending).rejects.toThrow("phone left");
    expect(reads.filter((read) => read.signal).every((read) => read.signal!.aborted)).toBe(true);
  });

  it("does not start when the signal has already aborted", async () => {
    const { admin, reads } = client({});
    const caller = new AbortController();
    caller.abort(new Error("gone"));

    await expect(readIntakeWindow(admin, "u", { from: "2026-09-13", to: "2026-09-19" },
      { today: "2026-09-19", signal: caller.signal })).rejects.toThrow("gone");
    expect(reads).toEqual([]);
  });
});

describe("recentRecordedDates", () => {
  it("unions logged dates with eaten plan slots inside the lookback, latest `count` first-to-last", async () => {
    const { admin, reads } = client({
      daily_energy: [{ local_date: "2026-09-18" }, { local_date: "2026-09-12" }, { local_date: "2026-05-01" }],
      plan_days: [
        { local_date: "2026-09-15", eaten_slots: { "meal-1": mark("2026-09-15T12:00:00Z") } },
        { local_date: "2026-09-16", eaten_slots: {} },
      ],
    });

    const dates = await recentRecordedDates(admin, "u", { from: "2026-06-22", to: "2026-09-19", count: 7 });

    expect(dates).toEqual(["2026-09-12", "2026-09-15", "2026-09-18"]);
    expect(reads.find((read) => read.table === "daily_energy")?.filters).toEqual([
      ["gte", "local_date", "2026-06-22"], ["lte", "local_date", "2026-09-19"],
    ]);
  });
});
