import { LB_PER_KG } from "@/lib/health/units";
import type { ChartBlockV1 } from "@/lib/coach/ui-blocks";
import type { Macros } from "@/lib/types";

export type ChartArgs = {
  chart: "weight_trend" | "macros_today" | "kcal_week" | "macros_trend";
  days?: number;
};
export type MacroChartRow = {
  localDate: string;
  consumed: Pick<Macros, "protein" | "carbs" | "fat">;
  /** The revision in force that day; null before the account's first one (no target point). */
  target: Pick<Macros, "protein" | "carbs" | "fat"> | null;
  /** The day's consumed figures are a lower bound (#21), as `ChartBlockV1.partial`. */
  partial: boolean;
};
export type WeightChartRow = { localDate: string; bodyMassKg: number };
export type KcalChartRow = { localDate: string; consumedKcal: number; targetKcal: number };
export type ChartHydrationInput = {
  id: string;
  weightUnit?: "lb" | "kg";
  weightRows?: readonly WeightChartRow[];
  /** `partial`: the day's consumed figures are a lower bound (#21); see `ChartBlockV1.partial`. */
  day?: { consumed: Macros; targets: Macros; partial?: boolean };
  kcalRows?: readonly KcalChartRow[];
  macroRows?: readonly MacroChartRow[];
};

/** `kcal_week` keeps its name (and 7 as the default) but honours `days` up to 90. */
export const KCAL_WEEK_DEFAULT_DAYS = 7;
export const MACROS_TREND_DEFAULT_DAYS = 14;
export const TREND_MIN_DAYS = 7;
export const TREND_MAX_DAYS = 90;

/** A trend window in whole days, clamped to 7..90; `fallback` when absent or not a number. */
export function trendDays(days: number | undefined, fallback: number): number {
  if (typeof days !== "number" || !Number.isFinite(days)) return fallback;
  return Math.min(TREND_MAX_DAYS, Math.max(TREND_MIN_DAYS, Math.round(days)));
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function weightTrend(
  id: string, days: number, unit: "lb" | "kg", rows: readonly WeightChartRow[],
): ChartBlockV1 | null {
  const points = rows
    .filter((row) => Number.isFinite(row.bodyMassKg))
    .sort((a, b) => a.localDate.localeCompare(b.localDate))
    .map((row) => ({
      x: row.localDate,
      y: round1(unit === "lb" ? row.bodyMassKg * LB_PER_KG : row.bodyMassKg),
    }));
  if (points.length === 0) return null;
  return {
    kind: "chart", v: 1, id, chart: "weight_trend", days,
    series: [{ label: "Weight", points }], unit,
    caption: `Weight over the last ${days} days`,
  };
}

function macroPoints(macros: Macros) {
  return [
    { x: "protein", y: round1(macros.protein) },
    { x: "carbs", y: round1(macros.carbs) },
    { x: "fat", y: round1(macros.fat) },
    { x: "kcal", y: round1(macros.kcal) },
  ];
}

function macrosToday(id: string, day: ChartHydrationInput["day"]): ChartBlockV1 | null {
  if (!day) return null;
  return {
    kind: "chart", v: 1, id, chart: "macros_today",
    series: [
      { label: "Consumed", points: macroPoints(day.consumed) },
      { label: "Target", points: macroPoints(day.targets) },
    ],
    unit: "g / kcal", caption: "Today's macros and calories",
    ...(day.partial ? { partial: true } : {}),
  };
}

function kcalWeek(id: string, rows: readonly KcalChartRow[], limit: number): ChartBlockV1 | null {
  const logged = [...rows].sort((a, b) => a.localDate.localeCompare(b.localDate)).slice(-limit);
  if (logged.length === 0) return null;
  return {
    kind: "chart", v: 1, id, chart: "kcal_week", days: logged.length,
    series: [
      { label: "Consumed", points: logged.map((row) =>
        ({ x: row.localDate, y: round1(row.consumedKcal) })) },
      { label: "Target", points: logged.map((row) =>
        ({ x: row.localDate, y: round1(row.targetKcal) })) },
    ],
    unit: "kcal", caption: `Calories over ${logged.length} logged ${logged.length === 1 ? "day" : "days"}`,
  };
}

export const MACRO_TREND_KEYS = ["protein", "carbs", "fat"] as const;
const MACRO_LABEL = { protein: "Protein", carbs: "Carbs", fat: "Fat" } as const;

/**
 * Per logged day, protein, carbs and fat eaten ("Protein") and that day's target ("Protein
 * target"). A day with no revision keeps its eaten points and gets no target point. A partly
 * measured day is listed in `partialDays` (and `partial` is set) so the bars can say "at least".
 */
function macrosTrend(id: string, days: number, rows: readonly MacroChartRow[]): ChartBlockV1 | null {
  const logged = [...rows].sort((a, b) => a.localDate.localeCompare(b.localDate)).slice(-days);
  if (logged.length === 0) return null;
  const partialDays = logged.filter((row) => row.partial).map((row) => row.localDate);
  return {
    kind: "chart", v: 1, id, chart: "macros_trend", days,
    series: MACRO_TREND_KEYS.flatMap((key) => [
      { label: MACRO_LABEL[key], points: logged.map((row) =>
        ({ x: row.localDate, y: round1(row.consumed[key]) })) },
      { label: `${MACRO_LABEL[key]} target`, points: logged.flatMap((row) => row.target
        ? [{ x: row.localDate, y: round1(row.target[key]) }] : []) },
    ]),
    unit: "g",
    caption: `Protein, carbs and fat over ${logged.length} logged ${logged.length === 1 ? "day" : "days"}`
      + ` in the last ${days} days`,
    ...(partialDays.length > 0 ? { partial: true, partialDays } : {}),
  };
}

export function hydrateChart(
  args: ChartArgs, input: ChartHydrationInput,
): ChartBlockV1 | null {
  if (args.chart === "weight_trend") {
    // The caller passes the account's unit (lib/coach/blocks/index.ts `accountWeightUnit`).
    return weightTrend(input.id, args.days ?? 30, input.weightUnit ?? "lb", input.weightRows ?? []);
  }
  if (args.chart === "macros_today") return macrosToday(input.id, input.day);
  if (args.chart === "macros_trend") {
    return macrosTrend(input.id, trendDays(args.days, MACROS_TREND_DEFAULT_DAYS), input.macroRows ?? []);
  }
  return kcalWeek(input.id, input.kcalRows ?? [], trendDays(args.days, KCAL_WEEK_DEFAULT_DAYS));
}
