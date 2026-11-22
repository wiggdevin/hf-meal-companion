import { clampTrendDays } from "@/lib/coach/chart-grammar";
import { LB_PER_KG } from "@/lib/health/units";
import type { ChartBlockV1 } from "@/lib/coach/ui-blocks";
import type { Macros } from "@/lib/types";

export const MACRO_TREND_KEYS = ["protein", "carbs", "fat"] as const;
export type MacroTrendKey = typeof MACRO_TREND_KEYS[number];

export type ChartArgs = {
  chart: "weight_trend" | "macros_today" | "kcal_week" | "macros_trend";
  days?: number;
  /** `macros_trend`: the macro the person asked about, selected first. Never a value. */
  focus?: MacroTrendKey;
};
/** One macro of one charted day: `value` null when nothing eaten measured it; `partial` a floor. */
export type ChartIntake = { value: number | null; partial: boolean };
/** One charted day (lib/server/intake-window.ts `readIntakeWindow`). */
export type NutritionChartRow = {
  date: string;
  kcal: ChartIntake; protein: ChartIntake; carbs: ChartIntake; fat: ChartIntake;
  /** The revision in force that day; null before the account's first one (no target point). */
  target: Macros | null;
};
export type WeightChartRow = { localDate: string; bodyMassKg: number };
export type ChartHydrationInput = {
  id: string;
  weightUnit?: "lb" | "kg";
  weightRows?: readonly WeightChartRow[];
  /** `partial`: the day's consumed figures are a lower bound (#21); see `ChartBlockV1.partial`. */
  day?: { consumed: Macros; targets: Macros; partial?: boolean };
  /** `kcal_week` / `macros_trend`: the charted days, and the dates the window covers. */
  nutritionRows?: readonly NutritionChartRow[];
  range?: { start: string; end: string };
};

/** `kcal_week` keeps its name (and 7 as the default) but honours `days` up to 90. */
export const KCAL_WEEK_DEFAULT_DAYS = 7;
export const MACROS_TREND_DEFAULT_DAYS = 14;
export { TREND_MAX_DAYS, TREND_MIN_DAYS } from "@/lib/coach/chart-grammar";

/** A trend window in whole days, clamped to 7..90; `fallback` when absent or not a number. */
export function trendDays(days: number | undefined, fallback: number): number {
  return clampTrendDays(days, fallback);
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

/** More charted days than this are drawn as weekly means (components/coach/blocks/nutrition-trend.tsx). */
export const DAILY_COLUMN_MAX = 14;

/** A nutrition trend drawn as weekly means: more charted days than one column each can hold. */
export function trendByWeek(block: Pick<ChartBlockV1, "chart" | "series">): boolean {
  if (block.chart !== "kcal_week" && block.chart !== "macros_trend") return false;
  const dates = new Set(block.series.flatMap((series) => series.points.map((point) => point.x)));
  return dates.size > DAILY_COLUMN_MAX;
}

function shiftIso(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** "Sep 6 – Sep 19, 2026", or with both years when the range crosses one. */
export function rangeLabel(start: string, end: string): string {
  const fmt = (date: string, year: boolean) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US",
    { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  if (start === end) return fmt(end, true);
  return `${fmt(start, start.slice(0, 4) !== end.slice(0, 4))} – ${fmt(end, true)}`;
}

type IntakeKey = "kcal" | MacroTrendKey;

/**
 * One series per eaten figure ("Consumed" or "Protein"), with a point for EVERY charted day: its
 * value, or `y: null` when nothing that day measured it (never an exact 0), and `partial: true`
 * when it is a floor. The target series has a point only where the day has both a measured value
 * and a target, so a weekly target is never averaged over days that ate nothing measurable.
 */
function intakeSeries(rows: readonly NutritionChartRow[], key: IntakeKey, label: string, targetLabel: string) {
  return [
    { label, points: rows.map((row) => ({ x: row.date,
      // A floor keeps full precision: rounding 99.996 up to 100 would claim more than was eaten.
      // The client floors it at display (nutrition-trend.tsx `amount`).
      y: row[key].value === null ? null : row[key].partial ? row[key].value : round2(row[key].value!),
      ...(row[key].partial ? { partial: true as const } : {}) })) },
    { label: targetLabel, points: rows.flatMap((row) => row.target && row[key].value !== null
      ? [{ x: row.date, y: round2(row.target[key]) }] : []) },
  ];
}

function nutritionTrend(id: string, chart: "kcal_week" | "macros_trend", rows: readonly NutritionChartRow[],
  range: { start: string; end: string } | undefined, focus: MacroTrendKey | undefined): ChartBlockV1 | null {
  const logged = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  if (logged.length === 0) return null;
  const start = range?.start ?? logged[0].date;
  const end = range?.end ?? logged[logged.length - 1].date;
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  const count = `${logged.length} logged ${logged.length === 1 ? "day" : "days"}`;
  const partial = logged.some((row) => (chart === "kcal_week" ? [row.kcal] : [row.protein, row.carbs, row.fat])
    .some((intake) => intake.partial));
  const series = chart === "kcal_week"
    ? intakeSeries(logged, "kcal", "Consumed", "Target")
    : MACRO_TREND_KEYS.flatMap((key) => intakeSeries(logged, key, MACRO_LABEL[key], `${MACRO_LABEL[key]} target`));
  return {
    kind: "chart", v: 1, id, chart, days, start, end, series,
    unit: chart === "kcal_week" ? "kcal" : "g",
    caption: `${chart === "kcal_week" ? "Calories" : "Protein, carbs and fat"}, ${rangeLabel(start, end)} (${count})`,
    ...(chart === "macros_trend" && focus ? { focus } : {}),
    ...(partial ? { partial: true } : {}),
  };
}

const MACRO_LABEL = { protein: "Protein", carbs: "Carbs", fat: "Fat" } as const;

export function hydrateChart(
  args: ChartArgs, input: ChartHydrationInput,
): ChartBlockV1 | null {
  if (args.chart === "weight_trend") {
    // The caller passes the account's unit (lib/coach/blocks/index.ts `accountWeightUnit`).
    return weightTrend(input.id, args.days ?? 30, input.weightUnit ?? "lb", input.weightRows ?? []);
  }
  if (args.chart === "macros_today") return macrosToday(input.id, input.day);
  const focus = MACRO_TREND_KEYS.find((key) => key === args.focus);
  const rows = input.nutritionRows ?? [];
  // The caller passes the range it read; without one, a `days` window ends on the last charted day.
  const last = rows.map((row) => row.date).sort().at(-1);
  const windowed = args.chart === "macros_trend" || args.days !== undefined;
  const range = input.range ?? (last && windowed ? {
    start: shiftIso(last, -(trendDays(args.days,
      args.chart === "macros_trend" ? MACROS_TREND_DEFAULT_DAYS : KCAL_WEEK_DEFAULT_DAYS) - 1)), end: last,
  } : undefined);
  return nutritionTrend(input.id, args.chart, rows.filter((row) => !range || (row.date >= range.start
    && row.date <= range.end)), range, focus);
}
