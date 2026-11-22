"use client";

import { useState } from "react";
import TrendBars, { MACRO_CLASS, type TrendColumn } from "@/components/charts/TrendBars";
import Chip from "@/components/ui/Chip";
import type { ChartBlockV1 } from "@/lib/coach/ui-blocks";
import { isoShift, monthDay, weekdayShort } from "@/lib/trends/series";

type Macro = keyof typeof MACRO_CLASS;
const MACROS: Macro[] = ["protein", "carbs", "fat"];
const LABEL: Record<Macro, string> = { protein: "Protein", carbs: "Carbs", fat: "Fat" };
/** More logged days than this are drawn as weekly means, so a 90-day chart stays 13 columns. */
export const DAILY_COLUMN_MAX = 14;

const CAPTION = "text-tiny font-normal text-muted";
const grams = (value: number) => `${Math.round(value).toLocaleString("en-US")} g`;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function seriesMap(block: ChartBlockV1, label: string): Map<string, number> {
  return new Map(block.series.find((row) => row.label === label)?.points
    .map((point) => [point.x, point.y]) ?? []);
}

export type MacroDay = { date: string; value: number; target: number | null; partial: boolean };

/** The block's logged days for one macro, oldest first. A day with no target has `target: null`. */
export function macroDays(block: ChartBlockV1, macro: Macro): MacroDay[] {
  const eaten = seriesMap(block, LABEL[macro]);
  const targets = seriesMap(block, `${LABEL[macro]} target`);
  const partial = new Set(block.partialDays ?? []);
  return [...eaten].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({
    date, value, target: targets.get(date) ?? null, partial: partial.has(date),
  }));
}

/**
 * The drawn columns: one per logged day up to `DAILY_COLUMN_MAX`, else one per 7-day span counted
 * back from the last logged day, each the mean of its logged days (a span with none is a gap, never
 * 0). A span is partial when any of its days is; its target is the mean of the days that have one.
 */
export function macroColumns(days: MacroDay[], macro: Macro, windowDays: number): TrendColumn[] {
  if (days.length <= DAILY_COLUMN_MAX) {
    const step = days.length > 7 ? 2 : 1;
    return days.map((day, index) => ({
      label: index % step === 0 || index === days.length - 1
        ? days.length > 7 ? monthDay(day.date).split(" ")[1] : weekdayShort(day.date) : "",
      describe: `${weekdayShort(day.date)} ${monthDay(day.date)} · ${day.partial ? "at least " : ""}`
        + `${grams(day.value)} ${macro}${day.target === null ? "" : ` · target ${grams(day.target)}`}`,
      value: day.value, target: day.target, partial: day.partial,
    }));
  }
  const last = days[days.length - 1].date;
  const spans = Math.ceil(Math.max(windowDays, 7) / 7);
  const step = spans > 7 ? 2 : 1;
  return Array.from({ length: spans }, (_, index) => {
    const end = isoShift(last, -7 * (spans - 1 - index));
    const start = isoShift(end, -6);
    const inSpan = days.filter((day) => day.date >= start && day.date <= end);
    const withTarget = inSpan.flatMap((day) => (day.target === null ? [] : [day.target]));
    const value = inSpan.length > 0 ? mean(inSpan.map((day) => day.value)) : null;
    const target = withTarget.length > 0 ? mean(withTarget) : null;
    const partial = inSpan.some((day) => day.partial);
    const when = `Week of ${monthDay(start)}`;
    return {
      label: (spans - 1 - index) % step === 0 ? monthDay(start) : "",
      describe: value === null ? `${when} · nothing logged`
        : `${when} · ${partial ? "at least " : ""}${grams(value)} ${macro} a day`
          + `${target === null ? "" : ` · target ${grams(target)}`} · ${inSpan.length} of 7 days`,
      value, target, partial,
    };
  });
}

/** The figure's name: the caption and the last logged day, "at least" when that day is partial. */
function lastDayLabel(block: ChartBlockV1): string {
  const last = macroDays(block, "protein").at(-1);
  if (!last) return `${block.caption}; last value unavailable`;
  const parts = MACROS.map((key) => {
    const value = macroDays(block, key).find((day) => day.date === last.date)?.value;
    return `${value === undefined ? "?" : grams(value)} ${key}`;
  });
  return `${block.caption}; last logged day ${last.date}: ${last.partial ? "at least " : ""}${parts.join(", ")}`;
}

/** Protein, carbs and fat by logged day against each day's target, one macro at a time. */
function MacroTrend({ block }: { block: ChartBlockV1 }) {
  const caption = block.caption;
  const [macro, setMacro] = useState<Macro>("protein");
  const [selected, setSelected] = useState<number | null>(null);
  const days = macroDays(block, macro);
  if (days.length === 0) return <p className="m-0 text-caption text-muted">No logged days yet.</p>;
  const cols = macroColumns(days, macro, block.days ?? days.length);
  const weekly = days.length > DAILY_COLUMN_MAX;
  // Lower-bound days stay out of the average unless every day is one (then it says "at least").
  const whole = days.filter((day) => !day.partial);
  const avg = mean((whole.length > 0 ? whole : days).map((day) => day.value));
  const lastDay = days[days.length - 1];
  const summary = `${LABEL[macro]} by ${weekly ? "week" : "logged day"}: last logged day `
    + `${monthDay(lastDay.date)} ${lastDay.partial ? "at least " : ""}${grams(lastDay.value)}`
    + `${lastDay.target === null ? "" : ` of ${grams(lastDay.target)}`}.`;
  const readout = selected !== null && cols[selected] ? cols[selected].describe
    : `Average ${whole.length > 0 ? "" : "at least "}${grams(avg)} ${macro} a logged day`;
  const pick = (next: Macro) => { setMacro(next); setSelected(null); };
  return <div className="flex flex-col gap-2">
    <div role="group" aria-label="Macro" className="pill-in flex gap-1 rounded-3xl p-1">
      {MACROS.map((key) => <Chip key={key} selected={key === macro} onClick={() => pick(key)}>
        {LABEL[key]}
      </Chip>)}
    </div>
    <p className="m-0 truncate text-caption text-charcoal" aria-live="polite">{readout}</p>
    <TrendBars key={macro} cols={cols} metric="protein" tone={MACRO_CLASS[macro]} selected={selected}
      onSelect={setSelected} summary={summary} caption={caption} valueHeading={`${LABEL[macro]} (g)`} />
    {block.partial && <p className="m-0 text-tiny text-muted">Outlined bars are at least that much:
      part of what was eaten is only partly measured.</p>}
  </div>;
}

/** The coach's `macros_trend` chart block (`show_chart`), in the same ivory card as the others. */
export default function MacroTrendBlock({ block }: { block: ChartBlockV1 }) {
  return <figure className="shell m-0" aria-label={lastDayLabel(block)}>
    <div className="surface card-sm card-ivory flex flex-col gap-2">
      <MacroTrend block={block} />
      <figcaption className={CAPTION}>{block.caption}</figcaption>
    </div>
  </figure>;
}
