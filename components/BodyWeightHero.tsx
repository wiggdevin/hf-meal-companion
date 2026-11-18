"use client";

import Sparkline from "@/components/Sparkline";
import { Figure } from "@/components/HealthMetricCard";
import CardFrame from "@/components/ui/CardFrame";

/**
 * Body's one hero: the latest weigh-in on the matte black card (the High Frequency Nutrition
 * screen's pattern: a caps eyebrow, the figure in the giant display numeral, one line under it).
 * It is the Weight metric card, promoted: same series, same accessible sparkline name, drawn in the
 * calorie gauge colour, which is bone inside the matte. A week's change needs two readings; with
 * fewer it says nothing rather than "0".
 */
export function weekChange(points: (number | null)[], unit: string): string | null {
  const seen = points.flatMap((point) => point === null ? [] : [point]);
  if (seen.length < 2) return null;
  const change = Math.round((seen[seen.length - 1] - seen[0]) * 10) / 10;
  if (change === 0) return "No change this week";
  return `${change > 0 ? "+" : "−"}${Math.abs(change)} ${unit} this week`;
}

export default function BodyWeightHero({ value, points, stroke, footnote, unit }: {
  value: string; points: (number | null)[]; stroke: string; footnote: string; unit: string;
}) {
  const change = weekChange(points, unit);
  return (
    <CardFrame as="section" tone="ink" size="lg" aria-label="Weight">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow m-0 text-muted">Weight</p>
        {change && (
          <span className="rounded-full border border-hairline px-3 py-1 text-caption font-medium text-charcoal">
            {change}
          </span>
        )}
      </div>
      <Figure value={value} numeral="text-numeral-xl" />
      <Sparkline points={points} stroke={stroke} width={300} height={56}
        label="Weight, last seven days" className="h-auto w-full" />
      <p className="m-0 text-tiny font-normal text-muted">{footnote}</p>
    </CardFrame>
  );
}
