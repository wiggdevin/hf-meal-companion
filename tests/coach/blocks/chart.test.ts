import { describe, expect, it } from "vitest";
import { hydrateChart, trendDays } from "@/lib/coach/blocks/hydrate-chart";
import { chartBlockV1Schema } from "@/lib/coach/ui-blocks";

const day = {
  date: "2026-09-19",
  consumed: { protein: 72, carbs: 140, fat: 38, kcal: 1300 },
  targets: { protein: 135, carbs: 240, fat: 70, kcal: 2200 },
};

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

  it("keeps only the last seven logged calorie days", () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({
      localDate: `2026-09-${String(index + 10).padStart(2, "0")}`,
      consumedKcal: index === 0 ? 0 : 1200 + index,
      targetKcal: 2100,
    }));
    const block = hydrateChart({ chart: "kcal_week" }, { id: "chart-3", kcalRows: rows });
    expect(block?.series[0].points).toHaveLength(7);
    expect(block?.series[0].points[0]).toEqual({ x: "2026-09-12", y: 1202 });
    expect(block).toMatchObject({
      chart: "kcal_week", days: 7, unit: "kcal",
      caption: "Calories over 7 logged days",
    });
  });

  it("states the actual number of logged calorie days", () => {
    const block = hydrateChart({ chart: "kcal_week" }, { id: "chart-4", kcalRows: [
      { localDate: "2026-09-10", consumedKcal: 1200, targetKcal: 2100 },
      { localDate: "2026-09-19", consumedKcal: 1400, targetKcal: 2200 },
    ] });

    expect(block).toMatchObject({ days: 2, caption: "Calories over 2 logged days" });
  });

  it("keeps a logged day even when its foods total zero calories", () => {
    const block = hydrateChart({ chart: "kcal_week" }, { id: "chart-5", kcalRows: [
      { localDate: "2026-09-19", consumedKcal: 0, targetKcal: 2200 },
    ] });

    expect(block).toMatchObject({
      days: 1, caption: "Calories over 1 logged day",
    });
    expect(block?.series[0].points).toEqual([{ x: "2026-09-19", y: 0 }]);
  });

  it("honours kcal_week days up to 90 and keeps seven as the default", () => {
    const rows = Array.from({ length: 95 }, (_, index) => ({
      localDate: new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10),
      consumedKcal: 1500, targetKcal: 2000,
    }));
    const month = hydrateChart({ chart: "kcal_week", days: 30 }, { id: "c", kcalRows: rows });
    expect(month).toMatchObject({ days: 30, caption: "Calories over 30 logged days" });
    expect(hydrateChart({ chart: "kcal_week", days: 365 }, { id: "c", kcalRows: rows })?.days).toBe(90);
    expect(hydrateChart({ chart: "kcal_week" }, { id: "c", kcalRows: rows })?.days).toBe(7);
  });

  it.each([
    [undefined, 14], [30, 30], [3, 7], [365, 90], [Number.NaN, 14],
  ])("clamps the trend window %s to %s days", (days, expected) => {
    expect(trendDays(days, 14)).toBe(expected);
  });

  it("charts protein, carbs and fat per logged day against that day's target", () => {
    const block = hydrateChart({ chart: "macros_trend", days: 14 }, { id: "chart-6", macroRows: [
      { localDate: "2026-09-19", consumed: { protein: 90.04, carbs: 180, fat: 60 },
        target: { protein: 135, carbs: 240, fat: 70 }, partial: false },
      { localDate: "2026-09-10", consumed: { protein: 70, carbs: 150, fat: 50 },
        target: null, partial: false },
    ] });
    expect(block).toEqual({
      kind: "chart", v: 1, id: "chart-6", chart: "macros_trend", days: 14, unit: "g",
      caption: "Protein, carbs and fat over 2 logged days in the last 14 days",
      series: [
        { label: "Protein", points: [{ x: "2026-09-10", y: 70 }, { x: "2026-09-19", y: 90 }] },
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

  it("marks the partial days of a macros trend and passes schema validation", () => {
    const row = (localDate: string, partial: boolean) => ({ localDate,
      consumed: { protein: 80, carbs: 150, fat: 50 }, target: { protein: 120, carbs: 200, fat: 60 }, partial });
    const block = hydrateChart({ chart: "macros_trend" }, { id: "c", macroRows: [
      row("2026-09-18", true), row("2026-09-19", false),
    ] });
    expect(block).toMatchObject({ days: 14, partial: true, partialDays: ["2026-09-18"] });
    expect(chartBlockV1Schema.parse(block).partialDays).toEqual(["2026-09-18"]);
    const whole = hydrateChart({ chart: "macros_trend" }, { id: "c", macroRows: [row("2026-09-19", false)] });
    expect(whole && ("partial" in whole || "partialDays" in whole)).toBe(false);
  });

  it.each([
    ["weight_trend", { id: "empty", weightRows: [], weightUnit: "kg" }],
    ["macros_trend", { id: "empty", macroRows: [] }],
    ["macros_today", { id: "empty" }],
    ["kcal_week", { id: "empty", kcalRows: [] }],
  ] as const)("returns no %s block when its source is empty", (chart, input) => {
    expect(hydrateChart({ chart }, input)).toBeNull();
  });
});
