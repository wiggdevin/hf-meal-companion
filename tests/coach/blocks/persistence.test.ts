import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposedMeal } from "@/lib/coach/compose";
import { uiBlockSchema } from "@/lib/coach/ui-blocks";
import { runTurn } from "@/tests/coach/fixtures/run-turn";

const request = {
  threadId: null,
  messageId: "3f1b1a2c-0000-4000-8000-000000000010",
  text: "What would you ask next?",
  now: "2026-09-19T10:00:00-06:00",
  tz: "America/Denver",
};

type Query = {
  table: string;
  columns: string;
  equals: Record<string, unknown>;
  limit: number | null;
  orders: { column: string; ascending: boolean }[];
  gte?: Record<string, unknown>;
  lte?: Record<string, unknown>;
  in?: Record<string, readonly unknown[]>;
};

/** Whether `row` passes the query's eq/gte/lte/in filters, on the columns the row carries. */
function matches(query: Query, row: unknown): boolean {
  if (!row || typeof row !== "object") return true;
  const record = row as Record<string, unknown>;
  const has = (column: string) => Object.prototype.hasOwnProperty.call(record, column);
  const value = (column: string) => String(record[column]);
  return Object.entries(query.equals).every(([c, v]) => !has(c) || record[c] === v)
    && Object.entries(query.gte ?? {}).every(([c, v]) => !has(c) || value(c) >= String(v))
    && Object.entries(query.lte ?? {}).every(([c, v]) => !has(c) || value(c) <= String(v))
    && Object.entries(query.in ?? {}).every(([c, v]) => !has(c) || v.map(String).includes(value(c)));
}

/** A postgrest double that honours eq, gte, lte, in and limit on the rows `answer` supplies. */
function database(
  writes: { table: string; row: Record<string, unknown> }[],
  answer: (query: Query) => { data: unknown[]; error: unknown } = () => ({ data: [], error: null }),
  queries: Query[] = [],
) {
  const filtered = (query: Query) => {
    const result = answer(query);
    if (result.error || !Array.isArray(result.data)) return result;
    const rows = result.data.filter((row) => matches(query, row));
    return { ...result, data: query.limit === null ? rows : rows.slice(0, query.limit) };
  };
  const from = (table: string) => {
    const query: Query = { table, columns: "", equals: {}, limit: null, orders: [] };
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: (columns: string) => { query.columns = columns; return chain; },
      eq: (column: string, value: unknown) => { query.equals[column] = value; return chain; },
      neq: () => chain, lt: () => chain, is: () => chain,
      gte: (column: string, value: unknown) => { query.gte = { ...query.gte, [column]: value }; return chain; },
      lte: (column: string, value: unknown) => { query.lte = { ...query.lte, [column]: value }; return chain; },
      in: (column: string, values: readonly unknown[]) => {
        query.in = { ...query.in, [column]: [...values] };
        return chain;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        query.orders.push({ column, ascending: options?.ascending ?? true });
        return chain;
      },
      limit: (value: number) => { query.limit = value; return chain; },
      range: () => chain,
      // Consult `answer` so a fixture can supply a single row (a target revision,
      // say) and not only list reads.
      maybeSingle: async () => ({ data: filtered(query).data[0] ?? null, error: null }),
      single: async () => ({ data: filtered(query).data[0] ?? null, error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown) => {
        queries.push({ ...query, equals: { ...query.equals }, orders: [...query.orders],
          ...(query.gte ? { gte: { ...query.gte } } : {}),
          ...(query.lte ? { lte: { ...query.lte } } : {}),
          ...(query.in ? { in: { ...query.in } } : {}) });
        return Promise.resolve(filtered(query) as { data: unknown[]; error: null }).then(resolve, reject);
      },
      insert: (row: Record<string, unknown>) => { writes.push({ table, row }); return chain; },
      update: () => chain,
    });
    return chain;
  };
  return { from, rpc: async () => ({ data: [], error: null }) } as never;
}

/** A chart needs a target row: a day with no revision is not plotted (design §5.3). */
const TARGET_PROFILE_ROW = {
  id: "target-1", user_id: "user-1", effective_from: "2026-09-01", rev: 1,
  kcal_train: 2200, kcal_rest: 1800, authored_by: "user", mode: "grams",
  protein_g: 120, fat_g: 80, carb_g: 250,
  protein_pct: null, fat_pct: null, carb_pct: null,
  kcal_min: 1200, protein_g_min: 120, fat_g_min: 50, carb_g_min: 0,
  goal_rate_bp_week: 0, max_weekly_kcal_step: 150, notes: null, target_source: "derived",
  training_macros: { kcal: 2200, protein: 120, carbs: 250, fat: 80 },
  rest_macros: { kcal: 1800, protein: 120, carbs: 150, fat: 80 },
  pin_training_kcal: null, pin_rest_kcal: null, pin_protein_g: null,
  input_weight_kg: 59.25, input_weight_source: "weigh-in", input_training_weekdays: [1, 3, 5],
  input_activity_level: "moderate", input_goal: "recomp", formula_name: "profile-energy-v1",
};

const sample = (value: number, date = "2026-09-19") => ({
  value, unit: "kg", start_time: `${date}T08:00:00.000Z`, end_time: `${date}T08:00:00.000Z`,
  tz: "America/Denver", device_label: null, vendor_sample_id: `sample-${date}`,
  health_sources: { kind: "device" },
});

type EntryValues = { kcal?: number; protein?: number; carbs?: number; fat?: number | null;
  partial?: boolean };

/** One logged meal on `date` (its `local_date`), 100 g of one food with these per-meal totals. */
function loggedEntry(date: string, values: EntryValues = {}) {
  const snapshot: Record<string, { amount: number }> = {
    energy_kcal_calc: { amount: values.kcal ?? (date === "2026-09-19" ? 1400 : 1250) },
    protein: { amount: values.protein ?? 80 }, carbohydrate: { amount: values.carbs ?? 150 },
  };
  if (values.fat !== null) snapshot.fat_total = { amount: values.fat ?? 45 };
  return {
    id: `entry-${date}`, local_date: date, eaten_at: `${date}T18:00:00.000Z`, slot: "meal-1", note: null,
    log_items: [{
      seq: 0, grams: 100, food_ref_id: `food-${date}`, nutrition_partial: values.partial ?? false,
      snapshot,
    }],
  };
}

/** Rows for the nutrition chart reads: entries, the logged-date index and the target revisions. */
function nutritionRows(entries: ReturnType<typeof loggedEntry>[], profiles: unknown[] = [TARGET_PROFILE_ROW],
  plans: Record<string, unknown>[] = []) {
  return (query: Query) => {
    if (query.table === "target_profiles") return { data: profiles, error: null };
    if (query.table === "log_entries") return { data: entries, error: null };
    if (query.table === "plan_days") return { data: plans, error: null };
    if (query.table === "daily_energy" && query.columns === "local_date") {
      return { data: [...entries].sort((a, b) => b.local_date.localeCompare(a.local_date))
        .map(({ local_date }) => ({ local_date })), error: null };
    }
    return { data: [], error: null };
  };
}

function foodHit(index: number) {
  return {
    foodRefId: `food-${index}`, catalogFoodRevisionId: index + 1, name: `Food ${index}`,
    brand: null, kcalPer100g: 100 + index, prefStatus: null,
    allergenTags: [], category: [],
  };
}

const composedMeal: ComposedMeal = {
  wish: "chicken rice bowl", slot: "meal-2",
  items: [{
    name: "Chicken breast", foodRefId: "food-chicken", catalogFoodRevisionId: 71,
    grams: 120, kcalPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6,
    macros: { kcal: 198, protein: 37.2, carbs: 0, fat: 4.3 }, verdict: "allowed",
  }, {
    name: "Avocado", foodRefId: "food-avocado", catalogFoodRevisionId: 72,
    grams: 50, kcalPer100g: 160, proteinPer100g: 2, carbsPer100g: 8.5, fatPer100g: 14.7,
    macros: { kcal: 80, protein: 1, carbs: 4.3, fat: 7.4 }, verdict: "allowed",
    addedFor: "fat",
  }],
  totals: { kcal: 278, protein: 38.2, carbs: 4.3, fat: 11.7 },
  target: { kcal: 300, protein: 40, carbs: 5, fat: 12 },
  flagged: [], fitsTarget: true,
};

describe("server block persistence", () => {
  beforeEach(() => vi.stubEnv("COACH_ENABLED", "1"));
  afterEach(() => vi.unstubAllEnvs());

  it("validates and persists hydrated blocks on the assistant message", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const client = database(writes);
    const generate = vi.fn()
      .mockResolvedValueOnce({ kind: "tool", calls: [{
        name: "quick_replies", args: { options: ["Show today", "Plan tomorrow"] },
      }] })
      .mockResolvedValueOnce({ kind: "final", text: "Which would help?" });

    const result = await runTurn(client, client, "user-1", request, {
      generate: generate as never,
      logEntryExists: async () => true,
      classifyIntent: vi.fn().mockResolvedValue(null) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    const assistant = writes.filter((write) => write.table === "coach_messages").at(-1)!.row;
    const blocks = (assistant.tool_calls as { blocks: unknown[] }).blocks;
    expect(blocks).toHaveLength(1);
    expect(uiBlockSchema.parse(blocks[0])).toMatchObject({
      kind: "quick_replies", options: ["Show today", "Plan tomorrow"],
    });
    expect(blocks.some((block) => uiBlockSchema.parse(block).kind === "next_action_chip"))
      .toBe(false);
    // Read back, each block says who produced it; the stored block carries no claim of its own.
    expect(result.messages.at(-1)?.blocks).toEqual(blocks.map((block) => ({ ...(block as object),
      provenance: { ai: true, source: "model", purpose: "coach" } })));
    expect(result.provenance).toEqual({ ai: true, source: "model", purpose: "coach" });
    expect(writes.map((write) => write.table)).not.toEqual(expect.arrayContaining([
      "health_samples", "log_entries", "plan_days", "user_food_prefs", "user_settings",
    ]));
  });

  it("returns invalid tool arguments to the model instead of throwing the turn", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const client = database(writes);
    const generate = vi.fn()
      .mockResolvedValueOnce({ kind: "tool", calls: [{
        name: "quick_replies", args: { options: ["Only one"] },
      }] })
      .mockResolvedValueOnce({ kind: "final", text: "Tell me what you prefer." });

    await expect(runTurn(client, client, "user-1", request, {
      generate: generate as never,
      logEntryExists: async () => true,
      classifyIntent: vi.fn().mockResolvedValue(null) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: () => "generated-1",
    })).resolves.toMatchObject({ messages: [
      { role: "user" }, { role: "assistant", content: "Tell me what you prefer." },
    ] });
    const assistant = writes.filter((write) => write.table === "coach_messages").at(-1)!.row;
    expect((assistant.tool_calls as { blocks: unknown[] }).blocks).toEqual([]);
    expect(JSON.stringify(assistant.tool_calls)).toContain("invalid_arguments");
  });

  it("hydrates weight history through runTurn without writing the series into the model transcript", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const client = database(writes, ({ table }) => ({
      data: table === "health_samples" ? [sample(57.6, "2026-09-18"), sample(58)] : [],
      error: null,
    }));
    const generate = vi.fn()
      .mockResolvedValueOnce({ kind: "tool", calls: [{
        name: "show_chart", args: { chart: "weight_trend", days: 30 },
      }] })
      .mockResolvedValueOnce({ kind: "final", text: "Here is your weight trend." });

    const result = await runTurn(client, client, "user-1", {
      ...request, text: "Show my weight trend",
    }, {
      generate: generate as never,
      logEntryExists: async () => true,
      classifyIntent: vi.fn().mockResolvedValue(null) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    const transcript = (generate.mock.calls[1][0] as { payload: { parts: { text: string }[] } }).payload.parts[0].text;
    expect(transcript).toContain('"block":"chart"');
    expect(transcript).toContain('"points":2');
    expect(transcript).not.toContain('"series"');
    expect(transcript).not.toMatch(/127(?:\.0|\.9)?/);
    expect(result.messages.at(-1)?.blocks?.[0]).toMatchObject({
      kind: "chart", chart: "weight_trend", series: [{ points: expect.any(Array) }],
    });
    expect(result.messages.at(-1)?.blocks).toHaveLength(1);
    const assistant = writes.filter((write) => write.table === "coach_messages").at(-1)!.row;
    expect(JSON.stringify((assistant.tool_calls as { calls: unknown }).calls)).not.toContain("127");
  });

  it("degrades a hydration failure to a plain reply without persisting an invalid block", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const client = database(writes, ({ table }) => ({
      data: [], error: table === "health_samples" ? { message: "read failed" } : null,
    }));
    const generate = vi.fn()
      .mockResolvedValueOnce({ kind: "tool", calls: [{
        name: "show_chart", args: { chart: "weight_trend", days: 30 },
      }] })
      .mockResolvedValueOnce({ kind: "final", text: "I could not load that chart right now." });

    await expect(runTurn(client, client, "user-1", request, {
      generate: generate as never,
      logEntryExists: async () => true,
      classifyIntent: vi.fn().mockResolvedValue(null) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: () => "generated-1",
    })).resolves.toMatchObject({ messages: [
      { role: "user" },
      { role: "assistant", content: "I could not load that chart right now." },
    ] });
    const assistant = writes.filter((write) => write.table === "coach_messages").at(-1)!.row;
    expect((assistant.tool_calls as { blocks: unknown[] }).blocks).toEqual([]);
  });

  it.each([
    [11, true],
    [10, false],
  ] as const)(
    "returns ten of %i food-search hits and reports truncated=%s",
    async (hitCount, truncated) => {
      const writes: { table: string; row: Record<string, unknown> }[] = [];
      const client = database(writes);
      const hits = Array.from({ length: hitCount }, (_, index) => foodHit(index + 1));
      const searchFoods = vi.fn(async (_userId: string, _query: string, limit: number) =>
        hits.slice(0, limit));
      const generate = vi.fn()
        .mockResolvedValueOnce({ kind: "tool", calls: [{
          name: "search_foods", args: { query: "food", intent: "browse", limit: 10 },
        }] })
        .mockResolvedValueOnce({ kind: "final", text: "Here are the matches." });

      await runTurn(client, client, "user-1", request, {
        generate: generate as never,
        logEntryExists: async () => true,
        classifyIntent: vi.fn().mockResolvedValue(null) as never,
        verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
        ports: { searchFoods },
        newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
      });

      expect(searchFoods).toHaveBeenCalledWith("user-1", "food", 11);
      const assistant = writes.filter((write) => write.table === "coach_messages").at(-1)!.row;
      const block = uiBlockSchema.parse(
        (assistant.tool_calls as { blocks: unknown[] }).blocks[0],
      );
      expect(block).toMatchObject({ kind: "food_search", truncated });
      expect(block.kind === "food_search" ? block.results : []).toHaveLength(10);
      expect((assistant.tool_calls as { blocks: unknown[] }).blocks).toHaveLength(1);
    },
  );

  it("persists named food-idea acknowledgement separately from the full block", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const client = database(writes);
    const generate = vi.fn()
      .mockResolvedValueOnce({ kind: "tool", calls: [{
        name: "compose_meal", args: { wish: "chicken rice bowl", slot: "meal-2" },
      }] })
      .mockResolvedValueOnce({ kind: "final", text: "Here is the meal." });

    await runTurn(client, client, "user-1", request, {
      generate: generate as never,
      logEntryExists: async () => true,
      classifyIntent: vi.fn().mockResolvedValue(null) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      ports: { compose: async () => composedMeal },
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    const assistant = writes.filter((write) => write.table === "coach_messages").at(-1)!.row;
    const toolCalls = assistant.tool_calls as {
      calls: { result?: unknown }[];
      blocks: unknown[];
    };
    expect(toolCalls.calls[0].result).toEqual({
      ok: true,
      block: "food_ideas",
      ideas: [{
        wish: "chicken rice bowl",
        slot: "meal-2",
        itemNames: ["Chicken breast", "Avocado"],
        composerAdded: [{ name: "Avocado", for: "fat" }],
        fitsTarget: true,
      }],
    });
    expect(JSON.stringify(toolCalls.calls[0].result))
      .not.toMatch(/"(?:totals|target|kcal)"\s*:/i);
    expect(uiBlockSchema.parse(toolCalls.blocks[0])).toMatchObject({
      kind: "food_ideas",
      ideas: [{
        items: [{ name: "Chicken breast", grams: 120 }, { name: "Avocado", grams: 50 }],
        totals: composedMeal.totals,
        target: composedMeal.target,
      }],
    });
    expect(toolCalls.blocks).toHaveLength(2);
    expect(uiBlockSchema.parse(toolCalls.blocks[1])).toMatchObject({
      kind: "next_action_chip", action: "pick_suggestion",
    });
  });

  it.each([
    ["show my weight trend", "weight_trend"],
    ["how am I doing this week", "kcal_week"],
  ] as const)("fast-paths %s to a hydrated block without calling Gemini", async (text, chart) => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const rows = nutritionRows([loggedEntry("2026-09-10"), loggedEntry("2026-09-19")]);
    const client = database(writes, (query) => query.table === "health_samples"
      ? { data: [sample(58)], error: null } : rows(query));
    const generate = vi.fn();
    const classified = {
      intent: "show_chart", confidence: 0.98, args: { chart }, argConfidence: { chart: 1 }, raw: {},
    };

    const result = await runTurn(client, client, "user-1", { ...request, text }, {
      generate: generate as never,
      classifyIntent: vi.fn().mockResolvedValue(classified) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ fastPath: true, toolsUsed: ["show_chart"] });
    expect(result.messages.at(-1)?.blocks?.[0]).toMatchObject({ kind: "chart", chart });
    if (chart === "kcal_week") {
      const block = result.messages.at(-1)?.blocks?.[0];
      // The span runs from the first to the last of the two logged days; today is still being eaten.
      expect(block).toMatchObject({
        days: 10, start: "2026-09-10", end: "2026-09-19", partial: true,
        caption: "Calories, Sep 10 – Sep 19, 2026 (2 logged days)",
      });
      expect(block?.kind === "chart" ? block.series[0].points : []).toEqual([
        { x: "2026-09-10", y: 1250 }, { x: "2026-09-19", y: 1400, partial: true },
      ]);
    }
  });

  it("bounds the logged-date query and renders the latest seven of forty logged days", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const queries: Query[] = [];
    const loggedDates = Array.from({ length: 40 }, (_, index) =>
      new Date(Date.parse("2026-09-19T12:00:00.000Z") - index * 86_400_000)
        .toISOString().slice(0, 10));
    const client = database(writes, nutritionRows(loggedDates.map((date) => loggedEntry(date))), queries);
    const classified = {
      intent: "show_chart", confidence: 0.98, args: { chart: "kcal_week" },
      argConfidence: { chart: 1 }, raw: {},
    };

    const result = await runTurn(client, client, "user-1", {
      ...request, text: "How am I doing this week?",
    }, {
      generate: vi.fn() as never,
      classifyIntent: vi.fn().mockResolvedValue(classified) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    expect(queries.filter((query) => query.columns === "local_date")).toEqual([expect.objectContaining({
      table: "daily_energy",
      equals: { user_id: expect.any(String) },
      gte: { local_date: "2026-06-22" },
      lte: { local_date: "2026-09-19" },
      limit: 7,
      orders: [{ column: "local_date", ascending: false }],
    })]);
    // The entries are read once, for exactly the seven dates, not once per day.
    const entryReads = queries.filter((query) => query.table === "log_entries");
    expect(entryReads).toHaveLength(1);
    expect(entryReads[0].in?.local_date).toEqual(loggedDates.slice(0, 7).reverse());
    const block = result.messages.at(-1)?.blocks?.[0];
    expect(block).toMatchObject({ kind: "chart", chart: "kcal_week", days: 7, start: "2026-09-13" });
    expect(block?.kind === "chart" ? block.series[0].points : []).toHaveLength(7);
  });

  it("fast-paths a two-week macros trend in one bounded read per table", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const queries: Query[] = [];
    const client = database(writes, nutritionRows([loggedEntry("2026-09-10"), loggedEntry("2026-09-19")]),
      queries);
    const classified = {
      intent: "show_chart", confidence: 0.98, args: { chart: "macros_trend", days: 14 },
      argConfidence: { chart: 1, days: 1 }, raw: {},
    };

    const result = await runTurn(client, client, "user-1", {
      ...request, text: "show my macros over the last 2 weeks",
    }, {
      generate: vi.fn() as never,
      classifyIntent: vi.fn().mockResolvedValue(classified) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    for (const table of ["log_entries", "plan_days"]) {
      const reads = queries.filter((query) => query.table === table && query.gte?.local_date !== undefined);
      expect(reads).toEqual([expect.objectContaining({
        gte: { local_date: "2026-09-06" }, lte: { local_date: "2026-09-19" },
      })]);
    }
    expect(queries.filter((query) => query.table === "daily_energy" && query.columns === "local_date"))
      .toEqual([]);
    expect(result).toMatchObject({ fastPath: true, toolsUsed: ["show_chart"] });
    const block = result.messages.at(-1)?.blocks?.[0];
    expect(block).toMatchObject({
      kind: "chart", chart: "macros_trend", days: 14, unit: "g", start: "2026-09-06", end: "2026-09-19",
    });
    const series = block?.kind === "chart" ? block.series : [];
    expect(series.find((row) => row.label === "Protein")?.points).toEqual([
      { x: "2026-09-10", y: 80 }, { x: "2026-09-19", y: 80, partial: true },
    ]);
    expect(series.find((row) => row.label === "Protein target")?.points.map((point) => point.x))
      .toEqual(["2026-09-10", "2026-09-19"]);
  });

  it("charts both window bounds around local midnight, follows a target revision and replays the saved block", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const queries: Query[] = [];
    // 23:30 in Denver is already 05:30 UTC on Sep 20: the window still ends on the local Sep 19.
    const lateNight = { ...request, now: "2026-09-19T23:30:00-06:00" };
    const revised = {
      ...TARGET_PROFILE_ROW, id: "target-2", effective_from: "2026-09-12", rev: 2, protein_g: 140,
      training_macros: { kcal: 2200, protein: 140, carbs: 250, fat: 80 },
      rest_macros: { kcal: 1800, protein: 140, carbs: 150, fat: 80 },
    };
    const future = { ...revised, id: "target-3", effective_from: "2026-09-25", rev: 3,
      training_macros: { kcal: 2200, protein: 999, carbs: 250, fat: 80 },
      rest_macros: { kcal: 1800, protein: 999, carbs: 150, fat: 80 } };
    const entries = ["2026-09-05", "2026-09-06", "2026-09-11", "2026-09-12", "2026-09-19", "2026-09-20"]
      .map((date) => loggedEntry(date));
    const client = database(writes, nutritionRows(entries, [TARGET_PROFILE_ROW, revised, future]), queries);
    const classified = {
      intent: "show_chart", confidence: 0.98, args: { chart: "macros_trend", days: 14 },
      argConfidence: { chart: 1, days: 1 }, raw: {},
    };

    const result = await runTurn(client, client, "user-1", { ...lateNight, text: "protein over 2 weeks" }, {
      generate: vi.fn() as never,
      classifyIntent: vi.fn().mockResolvedValue(classified) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    const block = result.messages.at(-1)?.blocks?.[0];
    expect(block).toMatchObject({ chart: "macros_trend", start: "2026-09-06", end: "2026-09-19" });
    const series = block?.kind === "chart" ? block.series : [];
    expect(series.find((row) => row.label === "Protein")?.points.map((point) => point.x))
      .toEqual(["2026-09-06", "2026-09-11", "2026-09-12", "2026-09-19"]);
    expect(series.find((row) => row.label === "Protein target")?.points.map((point) => point.y))
      .toEqual([120, 120, 140, 140]);
    expect(queries.find((query) => query.table === "target_profiles")?.lte)
      .toEqual({ effective_from: "2026-09-19" });
    // The block persisted on the message is the block shown, and it still validates on replay.
    const assistant = writes.filter((write) => write.table === "coach_messages").at(-1)!.row;
    const saved = (assistant.tool_calls as { blocks: unknown[] }).blocks[0];
    expect(uiBlockSchema.parse(saved)).toEqual(block);
  });

  it("charts unmeasured fat as blank, a recorded-partial day and today in progress as floors", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const client = database(writes, nutritionRows([
      loggedEntry("2026-09-15", { fat: null }),
      loggedEntry("2026-09-16", { protein: 90, partial: true }),
      loggedEntry("2026-09-17", { protein: 0, fat: 0 }),
      loggedEntry("2026-09-19", { protein: 30 }),
    ], [TARGET_PROFILE_ROW], [
      // A finished day today would chart as measured; this one is still open.
      { local_date: "2026-09-18", eaten_slots: [], day_complete_at: null },
    ]));
    const classified = {
      intent: "show_chart", confidence: 0.98, args: { chart: "macros_trend", days: 7 },
      argConfidence: { chart: 1, days: 1 }, raw: {},
    };

    const result = await runTurn(client, client, "user-1", { ...request, text: "macros this week" }, {
      generate: vi.fn() as never,
      classifyIntent: vi.fn().mockResolvedValue(classified) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    const block = result.messages.at(-1)?.blocks?.[0];
    expect(block).toMatchObject({ chart: "macros_trend", partial: true });
    const series = block?.kind === "chart" ? block.series : [];
    // Blank, never 0: no record measured that day's fat (and so its total is not a known one).
    expect(series.find((row) => row.label === "Fat")?.points).toEqual([
      { x: "2026-09-15", y: null, partial: true }, { x: "2026-09-16", y: 45, partial: true },
      { x: "2026-09-17", y: 0 }, { x: "2026-09-19", y: 45, partial: true },
    ]);
    expect(series.find((row) => row.label === "Protein")?.points).toEqual([
      { x: "2026-09-15", y: 80 }, { x: "2026-09-16", y: 90, partial: true },
      { x: "2026-09-17", y: 0 }, { x: "2026-09-19", y: 30, partial: true },
    ]);
    // No target point on a day whose fat nothing measured.
    expect(series.find((row) => row.label === "Fat target")?.points.map((point) => point.x))
      .toEqual(["2026-09-16", "2026-09-17", "2026-09-19"]);
  });

  it("hands the model only the macros_trend chart name and point count, never its values or dates", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const dates = ["2026-09-08", "2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"];
    const values = dates.map((_, index) => ({
      kcal: 1611.37 + index * 101.13, protein: 61.37 + index * 7.11, carbs: 141.29 + index * 9.17,
      fat: 37.43 + index * 3.19, partial: index === 2,
    }));
    const client = database(writes, nutritionRows(dates.map((date, index) => loggedEntry(date, values[index]))));
    const generate = vi.fn()
      .mockResolvedValueOnce({ kind: "tool", calls: [{ name: "show_chart", args: { chart: "macros_trend", days: 30 } }] })
      .mockResolvedValueOnce({ kind: "tool", calls: [{ name: "show_chart", args: { chart: "macros_trend", days: 14 } }] })
      .mockResolvedValueOnce({ kind: "final", text: "Here is your month." });

    const result = await runTurn(client, client, "user-1", { ...request, text: "how did my month go" }, {
      generate: generate as never,
      classifyIntent: vi.fn().mockResolvedValue(null) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    const block = result.messages.at(-1)?.blocks?.[0];
    expect(block).toMatchObject({ kind: "chart", chart: "macros_trend", days: 30, partial: true });
    expect(generate.mock.calls.length).toBeGreaterThanOrEqual(2);
    const afterChart = JSON.stringify(generate.mock.calls.slice(1));
    expect(afterChart).toContain('\\"chart\\":\\"macros_trend\\"');
    expect(afterChart).toContain('\\"points\\":30');
    const assistant = writes.filter((write) => write.table === "coach_messages").at(-1)!.row;
    // The second ask is refused (one chart per turn) and adds no values of its own.
    expect((assistant.tool_calls as { blocks: unknown[] }).blocks).toHaveLength(1);
    const toolResults = JSON.stringify((assistant.tool_calls as { calls: { result?: unknown }[] }).calls
      .map((call) => call.result));
    const leaks = [
      ...dates, "Sep 8", "Sep 16", "Protein target", "Carbs target", "partial",
      ...values.flatMap((day) => [day.kcal, day.protein, day.carbs, day.fat])
        .map((value) => String(Math.round(value * 100) / 100)),
    ];
    for (const leak of leaks) {
      expect(afterChart, leak).not.toContain(leak);
      expect(toolResults, leak).not.toContain(leak);
    }
  });

  it("gives the reply's one block slot to a chart over an earlier non-chart block", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const client = database(writes, nutritionRows([loggedEntry("2026-09-10"), loggedEntry("2026-09-18")]));
    const generate = vi.fn()
      .mockResolvedValueOnce({ kind: "tool", calls: [
        { name: "quick_replies", args: { options: ["Calories", "Protein"] } },
        { name: "show_chart", args: { chart: "kcal_week", days: 14 } },
      ] })
      .mockResolvedValueOnce({ kind: "final", text: "Here you go." });

    const result = await runTurn(client, client, "user-1", { ...request, text: "how am I eating" }, {
      generate: generate as never,
      classifyIntent: vi.fn().mockResolvedValue(null) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    expect(result.messages.at(-1)?.blocks).toEqual([
      expect.objectContaining({ kind: "chart", chart: "kcal_week", days: 14 }),
    ]);
  });

  it.each([
    [14, "kcal_week", "Here are your calories by logged day."],
    [30, "kcal_week", "Here are your calories by week (daily averages)."],
    [30, "macros_trend", "Here are your protein, carbs and fat by week (daily averages)."],
  ] as const)("fast-path copy for a %i-day %s names how it is grouped", async (days, chart, copy) => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const dates = Array.from({ length: 20 }, (_, index) =>
      new Date(Date.parse("2026-09-18T12:00:00.000Z") - index * 86_400_000).toISOString().slice(0, 10));
    const client = database(writes, nutritionRows(dates.map((date) => loggedEntry(date))));
    const classified = {
      intent: "show_chart", confidence: 0.98, args: { chart, days }, argConfidence: { chart: 1, days: 1 }, raw: {},
    };

    const result = await runTurn(client, client, "user-1", { ...request, text: "calories trend" }, {
      generate: vi.fn() as never,
      classifyIntent: vi.fn().mockResolvedValue(classified) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    expect(result).toMatchObject({ fastPath: true });
    expect(result.messages.at(-1)?.content).toBe(copy);
  });

  it("stops the chart reads when the caller's signal aborts, and still finishes the turn", async () => {
    const writes: { table: string; row: Record<string, unknown> }[] = [];
    const queries: Query[] = [];
    const client = database(writes, nutritionRows([loggedEntry("2026-09-18")]), queries);
    const classified = {
      intent: "show_chart", confidence: 0.98, args: { chart: "macros_trend", days: 14 },
      argConfidence: { chart: 1, days: 1 }, raw: {},
    };
    const gone = new AbortController();
    gone.abort(new Error("phone left"));

    const result = await runTurn(client, client, "user-1", { ...request, text: "macros trend" }, {
      signal: gone.signal,
      generate: vi.fn() as never,
      classifyIntent: vi.fn().mockResolvedValue(classified) as never,
      verifyReply: vi.fn().mockResolvedValue({ flagged: false, p: null }) as never,
      newId: (() => { let n = 0; return () => `generated-${++n}`; })(),
    });

    expect(result.messages.at(-1)?.blocks ?? []).toEqual([]);
    expect(queries.filter((query) => query.table === "log_entries" && query.gte)).toEqual([]);
  });
});
