"use client";

import MacroRings from "@/components/MacroRings";
import Sparkline from "@/components/Sparkline";
import type { ChartBlockV1 } from "@/lib/coach/ui-blocks";
import type { Macros } from "@/lib/types";

const CAPTION = "text-tiny font-normal text-muted";
/** The weight sparkline and today's rings; the nutrition trends are nutrition-trend.tsx. */
function pointsFor(block: ChartBlockV1, label: string): number[] {
  return (block.series.find((row) => row.label.toLowerCase() === label)?.points ?? [])
    .flatMap((point) => (point.y === null ? [] : [point.y]));
}

function lastValue(block: ChartBlockV1): number | null {
  // macros_today is keyed by nutrient, not by time: announce the kcal point, whatever its order.
  if (block.chart === "macros_today") return values(block.series, "consumed").get("kcal") ?? null;
  const points = pointsFor(block, "weight");
  return points.length > 0 ? points[points.length - 1] : null;
}

function values(series: ChartBlockV1["series"], label: string): Map<string, number> {
  return new Map(series.find((row) => row.label.toLowerCase() === label)?.points
    .flatMap((point) => (point.y === null ? [] : [[point.x, point.y] as const])) ?? []);
}

function macrosOf(block: ChartBlockV1, label: string): Macros | null {
  const points = values(block.series, label);
  const keys = ["protein", "carbs", "fat", "kcal"] as const;
  if (keys.some((key) => !points.has(key))) return null;
  return Object.fromEntries(keys.map((key) => [key, points.get(key)])) as Macros;
}

export default function ChartBlock({ block }: { block: ChartBlockV1 }) {
  if (!block.series.some((series) => series.points.length > 0)) return null;
  const last = lastValue(block);
  const aria = `${block.caption}; last value ${last ?? "unavailable"}${last === null ? "" : ` ${block.unit}`}`;
  if (block.chart === "macros_today") {
    const consumed = macrosOf(block, "consumed");
    const targets = macrosOf(block, "target");
    if (!consumed || !targets) return null;
    return <div className="flex flex-col gap-2" role="group" aria-label={aria}>
      <MacroRings consumed={consumed} targets={targets} partial={block.partial === true} />
      <p className={`m-0 px-1 ${CAPTION}`}>{block.caption}</p>
    </div>;
  }
  return (
    <figure className="shell m-0" aria-label={aria}>
      <div className="surface card-sm card-ivory flex flex-col">
        <Sparkline points={pointsFor(block, "weight")} width={280} height={56} label={aria} />
        <figcaption className={CAPTION}>{block.caption}</figcaption>
      </div>
    </figure>
  );
}
