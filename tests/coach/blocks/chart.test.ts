import { describe, expect, it } from "vitest";
import {
  hydrateChart, rangeLabel, trendByWeek, trendDays, type NutritionChartRow,
} from "@/lib/coach/blocks/hydrate-chart";
import { chartBlockV1Schema } from "@/lib/coach/ui-blocks";

const day = {
  date: "2026-09-19",
  consumed: { protein: 72, carbs: 140, fat: 38, kcal: 1300 },
  targets: { protein: 135, carbs: 240, fat: 70, kcal: 2200 },
};

type Values = Partial<Record<"kcal" | "protein" | "carbs" | "fat", number | null>>;
const TARGET = { kcal: 2000, protein: 135, carbs: 240, fat: 70 };
/** One charted day: measured values (null: not measured), the floors, and that day's target. */
function nrow(date: string, values: Values, partial: Partial<Record<keyof Values, boolean>> = {},
  target: NutritionChartRow["target"] = TARGET): NutritionChartRow {
  const at = (key: keyof Values, fallback: number) => ({
    value: key in values ? values[key]! : fallback, partial: partial[key] === true });
  return { date, kcal: at("kcal", 1500), protein: at("protein", 100), carbs: at("carbs", 200),
    fat: at("fat", 60), target };
}

describe("chart block hydration", () => {
  it("converts canonical weight rows into the user's pounds", () => {
    expect(hydrateChart({ chart: "weight_trend", days: 30 }, {
      id: "chart-1", weightUnit: "lb",
      weightRows: [
        { localDate: "2026-09-18", bodyMassKg: 57.6 },
        { localDate: "2026-09-19", bodyMassKg: 58 },
      ],
    })).toEqual({
      kind: "chart", v: 1, id: "chart-1", chart: "weight_trend", days: 30,
      series: [{ label: "Weight", points: [
        { x: "2026-09-18", y: 127 }, { x: "2026-09-19", y: 127.9 },
      ] }],
      unit: "lb", caption: "Weight over the last 30 days",
    });
  });

  it("uses today's context for consumed and target macros", () => {
    expect(hydrateChart({ chart: "macros_today" }, { id: "chart-2", day }))
      .toEqual({
        kind: "chart", v: 1, id: "chart-2", chart: "macros_today",
        series: [
          { label: "Consumed", points: [
            { x: "protein", y: 72 }, { x: "carbs", y: 140 },
            { x: "fat", y: 38 }, { x: "kcal", y: 1300 },
          ] },
          { label: "Target", points: [
            { x: "protein", y: 135 }, { x: "carbs", y: 240 },
            { x: "fat", y: 70 }, { x: "kcal", y: 2200 },
          ] },
        ],
        unit: "g / kcal", caption: "Today's macros and calories",
      });
  });

  it("charts every given calorie day over its stored range, with the range in the caption", () => {
    const rows = [nrow("2026-09-10", { kcal: 0 }), nrow("2026-09-19", { kcal: 1400.456 })];
    const block = hydrateChart({ chart: "kcal_week" }, { id: "chart-3", nutritionRows: rows,
      range: { start: "2026-09-10", end: "2026-09-19" } });
    expect(block).toMatchObject({
      chart: "kcal_week", days: 10, start: "2026-09-10", end: "2026-09-19", unit: "kcal",
      caption: "Calories, Sep 10 – Sep 19, 2026 (2 logged days)",
    });
    // A logged day whose foods total a measured 0 kcal keeps its 0; precision is kept to 2 places.
    expect(block?.series[0].points).toEqual([{ x: "2026-09-10", y: 0 }, { x: "2026-09-19", y: 1400.46 }]);
    expect(chartBlockV1Schema.safeParse(block).success).toBe(true);
  });

  it("never charts an unmeasured day as an exact 0: it is a blank floor, with no target point", () => {
    const block = hydrateChart({ chart: "kcal_week", days: 7 }, { id: "c", nutritionRows: [
      nrow("2026-09-18", { kcal: null }, { kcal: true }), nrow("2026-09-19", { kcal: 1500 }, { kcal: true }),
    ], range: { start: "2026-09-13", end: "2026-09-19" } });
    expect(block?.series[0].points).toEqual([
      { x: "2026-09-18", y: null, partial: true }, { x: "2026-09-19", y: 1500, partial: true },
    ]);
    expect(block?.series[1].points).toEqual([{ x: "2026-09-19", y: 2000 }]);
    expect(block).toMatchObject({ partial: true, days: 7 });
    expect(chartBlockV1Schema.safeParse(block).success).toBe(true);
  });

  it("names both years when the range crosses one", () => {
    expect(rangeLabel("2025-12-20", "2026-01-02")).toBe("Dec 20, 2025 – Jan 2, 2026");
    expect(rangeLabel("2026-09-19", "2026-09-19")).toBe("Sep 19, 2026");
  });

  it.each([
    [undefined, 14], [30, 30], [3, 7], [365, 90], [Number.NaN, 14],
  ])("clamps the trend window %s to %s days", (days, expected) => {
    expect(trendDays(days, 14)).toBe(expected);
  });

  it("charts protein, carbs and fat per logged day against that day's target", () => {
    const block = hydrateChart({ chart: "macros_trend", days: 14, focus: "carbs" }, { id: "chart-6",
      nutritionRows: [
        nrow("2026-09-10", { protein: 70, carbs: 150, fat: 50 }, {}, null),
        nrow("2026-09-19", { protein: 90.044, carbs: 180, fat: 60 }),
      ], range: { start: "2026-09-06", end: "2026-09-19" } });
    expect(block).toEqual({
      kind: "chart", v: 1, id: "chart-6", chart: "macros_trend", days: 14, unit: "g",
      start: "2026-09-06", end: "2026-09-19", focus: "carbs",
      caption: "Protein, carbs and fat, Sep 6 – Sep 19, 2026 (2 logged days)",
      series: [
        { label: "Protein", points: [{ x: "2026-09-10", y: 70 }, { x: "2026-09-19", y: 90.04 }] },
        // A day with no target revision keeps its eaten point and gets no target point.
        { label: "Protein target", points: [{ x: "2026-09-19", y: 135 }] },
        { label: "Carbs", points: [{ x: "2026-09-10", y: 150 }, { x: "2026-09-19", y: 180 }] },
        { label: "Carbs target", points: [{ x: "2026-09-19", y: 240 }] },
        { label: "Fat", points: [{ x: "2026-09-10", y: 50 }, { x: "2026-09-19", y: 60 }] },
        { label: "Fat target", points: [{ x: "2026-09-19", y: 70 }] },
      ],
    });
    expect(chartBlockV1Schema.safeParse(block).success).toBe(true);
  });

  it("marks each partial macro point, blanks a wholly unknown macro and passes the schema", () => {
    const block = hydrateChart({ chart: "macros_trend" }, { id: "c", nutritionRows: [
      nrow("2026-09-18", { protein: 80, carbs: null, fat: 20 }, { carbs: true, fat: true }),
      nrow("2026-09-19", { protein: 90, carbs: 150, fat: 50 }),
    ] });
    expect(block).toMatchObject({ days: 14, start: "2026-09-06", end: "2026-09-19", partial: true });
    const parsed = chartBlockV1Schema.parse(block);
    expect(parsed.series.find((row) => row.label === "Carbs")?.points[0]).toEqual({ x: "2026-09-18", y: null, partial: true });
    expect(parsed.series.find((row) => row.label === "Carbs target")?.points.map((p) => p.x)).toEqual(["2026-09-19"]);
    expect(parsed.series.find((row) => row.label === "Fat")?.points[0]).toEqual({ x: "2026-09-18", y: 20, partial: true });
    const whole = hydrateChart({ chart: "macros_trend" }, { id: "c", nutritionRows: [nrow("2026-09-19", {})] });
    expect(whole && "partial" in whole).toBe(false);
  });

  it("says by week when more days are charted than one column each", () => {
    const rows = Array.from({ length: 20 }, (_, i) => nrow(`2026-08-${String(i + 1).padStart(2, "0")}`, {}));
    const block = hydrateChart({ chart: "macros_trend", days: 30 }, { id: "c", nutritionRows: rows })!;
    expect(trendByWeek(block)).toBe(true);
    expect(trendByWeek(hydrateChart({ chart: "macros_trend" }, { id: "c", nutritionRows: rows.slice(0, 14) })!))
      .toBe(false);
  });

  it.each([
    ["weight_trend", { id: "empty", weightRows: [], weightUnit: "kg" }],
    ["macros_trend", { id: "empty", nutritionRows: [] }],
    ["macros_today", { id: "empty" }],
    ["kcal_week", { id: "empty", nutritionRows: [] }],
  ] as const)("returns no %s block when its source is empty", (chart, input) => {
    expect(hydrateChart({ chart }, input)).toBeNull();
  });
});
