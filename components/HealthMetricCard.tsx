"use client";

import Sparkline from "@/components/Sparkline";
import CardFrame from "@/components/ui/CardFrame";

/** "9,600 steps" → { figure: "9,600", unit: "steps" }; a figure with no unit ("7:36", "—") stays whole. */
export function splitFigure(value: string): { figure: string; unit: string | null } {
  const cut = value.lastIndexOf(" ");
  if (cut < 0 || !/\d/.test(value.slice(0, cut))) return { figure: value, unit: null };
  return { figure: value.slice(0, cut), unit: value.slice(cut + 1) };
}

/** A figure in the display numeral with its unit set small beside it, so a long unit never wraps the number. */
export function Figure({ value, numeral = "text-numeral-md" }: { value: string; numeral?: string }) {
  const { figure, unit } = splitFigure(value);
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`numeral ${numeral} text-charcoal`}>{figure}</span>
      {unit && <span className="text-caption font-medium text-muted">{unit}</span>}
    </span>
  );
}

/**
 * One observation card, compact (UI makeover §2.2): the metric's name, its latest figure in the
 * display numeral, the seven-day line and one footnote. Two sit side by side on `/body`; the line
 * sits at the foot so a name that wraps never lifts one card's chart above its neighbour's.
 */
export default function HealthMetricCard({ eyebrow, value, points, stroke, footnote }: {
  eyebrow: string; value: string; points: (number | null)[]; stroke: string; footnote: string;
}) {
  return (
    <CardFrame as="section" size="sm" aria-label={eyebrow} className="h-full">
      <p className="m-0 text-caption font-medium text-muted">{eyebrow}</p>
      <Figure value={value} />
      <span className="mt-auto flex flex-col gap-2 pt-1">
        <Sparkline points={points} stroke={stroke} label={`${eyebrow}, last seven days`}
          className="h-auto w-full" />
        <span className="text-tiny font-normal text-muted">{footnote}</span>
      </span>
    </CardFrame>
  );
}
