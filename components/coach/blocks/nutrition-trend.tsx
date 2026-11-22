"use client";

import { useState } from "react";
import TrendBars, { MACRO_CLASS, METRIC_CLASS, type TrendColumn } from "@/components/charts/TrendBars";
import Chip from "@/components/ui/Chip";
import { DAILY_COLUMN_MAX } from "@/lib/coach/blocks/hydrate-chart";
import type { ChartBlockV1 } from "@/lib/coach/ui-blocks";
import { isoShift, monthDay, weekdayShort } from "@/lib/trends/series";

/**
 * The coach's nutrition trends (`kcal_week`, `macros_trend`): one bar per logged day, or per week
 * (a daily mean) past `DAILY_COLUMN_MAX` days, against that period's target. A day nothing
 * measured is a gap, never 0; a floor ("at least") is outlined.
 */
type Key = "kcal" | "protein" | "carbs" | "fat";
type Macro = Exclude<Key, "kcal">;
const MACROS: Macro[] = ["protein", "carbs", "fat"];
const LABEL: Record<Key, string> = { kcal: "Consumed", protein: "Protein", carbs: "Carbs", fat: "Fat" };
const TARGET_LABEL: Record<Key, string> = {
  kcal: "Target", protein: "Protein target", carbs: "Carbs target", fat: "Fat target",
};
const NAME: Record<Key, string> = { kcal: "calories", protein: "protein", carbs: "carbs", fat: "fat" };

const CAPTION = "text-tiny font-normal text-muted";
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const DAY_MS = 86_400_000;
const spanDays = (start: string, end: string) =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;

/** A value as shown: a floor rounds down, so "at least" never overstates; kcal or grams. */
export function amount(value: number, key: Key, partial: boolean): string {
  const shown = (partial ? Math.floor(value) : Math.round(value)).toLocaleString("en-US");
  return key === "kcal" ? `${shown} kcal` : `${shown} g`;
}

/** "Tue, Sep 16, 2026". */
function fullDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US",
    { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Sep 6 – Sep 12, 2026" (both years when it crosses one). */
function rangeText(start: string, end: string): string {
  const year = (date: string) => date.slice(0, 4);
  if (start === end) return `${monthDay(end)}, ${year(end)}`;
  return `${monthDay(start)}${year(start) === year(end) ? "" : `, ${year(start)}`} – ${monthDay(end)}, ${year(end)}`;
}

export type TrendDay = { date: string; value: number | null; target: number | null; partial: boolean };

function seriesOf(block: ChartBlockV1, label: string) {
  return block.series.find((row) => row.label === label)?.points ?? [];
}

/** The block's charted days for one measure, oldest first. A target counts only beside a value. */
export function trendDays(block: ChartBlockV1, key: Key): TrendDay[] {
  const targets = new Map(seriesOf(block, TARGET_LABEL[key]).map((point) => [point.x, point.y]));
  return [...seriesOf(block, LABEL[key])].sort((a, b) => a.x.localeCompare(b.x)).map((point) => ({
    date: point.x, value: point.y,
    target: point.y === null ? null : targets.get(point.x) ?? null,
    partial: point.partial === true,
  }));
}

/** The window the block covers: the stored range, or (older blocks) its first and last day. */
export function windowOf(block: ChartBlockV1, days: TrendDay[]): { start: string; end: string } {
  return { start: block.start ?? days[0]?.date ?? "", end: block.end ?? days.at(-1)?.date ?? "" };
}

/** Axis labels, thinned from the last column back; the month shows first and wherever it changes. */
function axisLabels(dates: string[], weekdays: boolean): string[] {
  const step = dates.length > 7 ? 2 : 1;
  let lastMonth = "";
  const shown = dates.map((_, i) => (dates.length - 1 - i) % step === 0);
  return dates.map((date, i) => {
    if (!shown[i]) return "";
    if (weekdays) return weekdayShort(date);
    const month = date.slice(0, 7);
    const label = month !== lastMonth ? monthDay(date) : String(Number(date.slice(8, 10)));
    lastMonth = month;
    return label;
  });
}

function describe(when: string, value: number | null, target: number | null, partial: boolean, key: Key,
  tail = ""): string {
  if (value === null) return `${when} · ${NAME[key]} not measured${tail}`;
  return `${when} · ${partial ? "at least " : ""}${amount(value, key, partial)} ${key === "kcal" ? "" : `${NAME[key]} `}`
    .trimEnd() + `${target === null ? "" : ` · target ${amount(target, key, false)}`}${tail}`;
}

/**
 * The drawn columns. Daily: one per charted day. Weekly: 7-day spans counted back from the
 * window's end, the first clipped to its start; each the mean of its measured days (none: a gap).
 * A week's target is drawn only when every measured day in it has one.
 */
export function trendColumns(days: TrendDay[], key: Key, range: { start: string; end: string }):
  { cols: TrendColumn[]; weekly: boolean } {
  if (days.length <= DAILY_COLUMN_MAX) {
    const weekdays = spanDays(days[0].date, days[days.length - 1].date) <= 7;
    const labels = axisLabels(days.map((day) => day.date), weekdays);
    return { weekly: false, cols: days.map((day, i) => ({
      label: labels[i], rowLabel: fullDate(day.date),
      describe: describe(`${weekdayShort(day.date)} ${monthDay(day.date)}`, day.value, day.target, day.partial, key),
      value: day.value, target: day.target, partial: day.partial,
    })) };
  }
  const total = spanDays(range.start, range.end);
  const count = Math.ceil(total / 7);
  const spans = Array.from({ length: count }, (_, i) => {
    const end = isoShift(range.end, -7 * (count - 1 - i));
    const start = i === 0 ? range.start : isoShift(end, -6);
    return { start, end };
  });
  const labels = axisLabels(spans.map((span) => span.start), false);
  return { weekly: true, cols: spans.map((span, i) => {
    const inSpan = days.filter((day) => day.date >= span.start && day.date <= span.end);
    const measured = inSpan.filter((day) => day.value !== null);
    const value = measured.length > 0 ? mean(measured.map((day) => day.value!)) : null;
    const target = measured.length > 0 && measured.every((day) => day.target !== null)
      ? mean(measured.map((day) => day.target!)) : null;
    const partial = inSpan.some((day) => day.partial);
    const length = spanDays(span.start, span.end);
    const tail = ` a day · ${measured.length} measured of ${inSpan.length} logged · ${length} of 7 days`;
    const when = `Week ${rangeText(span.start, span.end)}`;
    return {
      label: labels[i], rowLabel: rangeText(span.start, span.end),
      describe: inSpan.length === 0 ? `${when} · nothing logged`
        : describe(when, value, target, partial, key, value === null ? "" : tail),
      value, target, partial,
    };
  }) };
}

/** The headline average, naming its sample: whole days when there are any, else a floor. */
export function averageText(days: TrendDay[], key: Key): string {
  const measured = days.filter((day) => day.value !== null);
  if (measured.length === 0) return `No measured ${NAME[key]} in these days.`;
  const whole = measured.filter((day) => !day.partial);
  const sample = whole.length > 0 ? whole : measured;
  const avg = mean(sample.map((day) => day.value!));
  const plural = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  const what = key === "kcal" ? "" : ` ${NAME[key]}`;
  return whole.length > 0
    ? `Average ${amount(avg, key, false)}${what} a day over ${plural(whole.length)} fully measured`
    : `At least ${amount(avg, key, true)}${what} a day over ${plural(measured.length)} logged`;
}

/** The figure's name: the caption and the last charted day, "at least" where it is a floor. */
export function lastDayLabel(block: ChartBlockV1): string {
  const keys: Key[] = block.chart === "kcal_week" ? ["kcal"] : MACROS;
  const last = trendDays(block, keys[0]).at(-1);
  if (!last) return `${block.caption}; last value unavailable`;
  const parts = keys.map((key) => {
    const day = trendDays(block, key).find((row) => row.date === last.date);
    if (!day || day.value === null) return `${NAME[key]} not measured`;
    return `${day.partial ? "at least " : ""}${amount(day.value, key, day.partial)}${key === "kcal" ? "" : ` ${key}`}`;
  });
  return `${block.caption}; last logged day ${monthDay(last.date)}: ${parts.join(", ")}`;
}

function Trend({ block }: { block: ChartBlockV1 }) {
  const isKcal = block.chart === "kcal_week";
  const [key, setKey] = useState<Key>(isKcal ? "kcal" : block.focus ?? "protein");
  const [selected, setSelected] = useState<number | null>(null);
  const days = trendDays(block, key);
  const pick = (next: Key) => { setKey(next); setSelected(null); };
  const chips = !isKcal && <div role="group" aria-label="Macro" className="pill-in flex gap-1 rounded-3xl p-1">
    {MACROS.map((macro) => <Chip key={macro} selected={macro === key} onClick={() => pick(macro)}>
      {LABEL[macro]}
    </Chip>)}
  </div>;
  if (days.length === 0) {
    return <>{chips}<p className="m-0 text-caption text-muted">No logged days for {NAME[key]} yet.</p></>;
  }
  const range = windowOf(block, days);
  const { cols, weekly } = trendColumns(days, key, range);
  const period = weekly ? "Week" : "Day";
  const last = days[days.length - 1];
  const summary = `${isKcal ? "Calories" : LABEL[key]} by ${weekly ? "week (daily average)" : "logged day"}: `
    + describe(`last logged day ${monthDay(last.date)}`, last.value, last.target, last.partial, key) + ".";
  const readout = selected !== null && cols[selected] ? cols[selected].describe : averageText(days, key);
  const move = (by: number) => setSelected((current) =>
    Math.min(cols.length - 1, Math.max(0, current === null ? (by < 0 ? cols.length - 1 : 0) : current + by)));
  const step = "tap min-h-11 min-w-11 rounded-full text-caption text-charcoal disabled:opacity-40";
  return <>
    {chips}
    <div className="flex items-center gap-1">
      <div role="group" aria-label={`Choose a ${period.toLowerCase()}`} className="flex shrink-0 gap-1">
        <button type="button" className={step} aria-label={`Previous ${period.toLowerCase()}`}
          disabled={selected === 0} onClick={() => move(-1)}>‹</button>
        <button type="button" className={step} aria-label={`Next ${period.toLowerCase()}`}
          disabled={selected === cols.length - 1} onClick={() => move(1)}>›</button>
      </div>
      <p className="m-0 min-w-0 flex-1 text-caption text-charcoal" aria-live="polite">{readout}</p>
    </div>
    <TrendBars key={key} cols={cols} metric={isKcal ? "kcal" : "protein"}
      tone={isKcal ? METRIC_CLASS.kcal : MACRO_CLASS[key as Macro]} edged selected={selected}
      onSelect={(index) => setSelected((current) => (current === index ? null : index))}
      summary={summary} caption={`${isKcal ? "Calories" : LABEL[key]}: ${block.caption}`}
      periodHeading={period} valueHeading={`${isKcal ? "Calories (kcal)" : `${LABEL[key]} (g)`}`} />
    {days.some((day) => day.partial) && <p className="m-0 text-tiny text-muted">Dashed bars are at least
      that much: part of what was eaten is only partly measured, or the day is still going.</p>}
  </>;
}

/** The coach's nutrition trend chart block (`show_chart`), in the same ivory card as the others. */
export default function NutritionTrendBlock({ block }: { block: ChartBlockV1 }) {
  return <figure className="shell m-0" aria-label={lastDayLabel(block)}>
    <div className="surface card-sm card-ivory flex flex-col gap-2">
      <Trend block={block} />
      <figcaption className={CAPTION}>{block.caption}</figcaption>
    </div>
  </figure>;
}
