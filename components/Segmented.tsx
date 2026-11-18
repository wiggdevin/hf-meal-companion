"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SPRINGS } from "@/lib/design/motion";

/**
 * The segmented control of the High Frequency mockup (brand v2), as real tabs: a black track with a
 * white active pill. It was the two-segment ink pill from Foods.dc.html. It was a pair of `aria-pressed`
 * buttons inside MyFoods.tsx; on the Foods tab it switches the whole page, which is a tablist.
 *
 * The selected segment keeps its 36 px visual, but the <button> around it is the full 44 px of
 * the pill so the hit box clears DESIGN.md Layout ("Every tap target is at least 44 × 44 px").
 * Both tabs stay in the tab order — there are two of them and no arrow-key handler to rescue a
 * roving tabindex.
 *
 * The white lens is one element that slides to the chosen segment on the snappy spring
 * (2026-10-01), so changing tab reads as the selection moving, never as two pills swapping.
 */

export function tabId(value: string): string {
  return `tab-${value}`;
}

export default function Segmented<T extends string>({ label, options, value, onChange, panel }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  /** The id of the one panel both tabs swap the contents of. */
  panel: string;
}) {
  const lens = useId();
  const reduceMotion = useReducedMotion();
  return (
    <div className="pill flex w-full min-w-0">
      {/* The black track: the matte scope keeps it basalt on the black ground too, so it never vanishes. */}
      <div
        role="tablist"
        aria-label={label}
        className="card-ink matte flex h-12 w-full items-center gap-0.5 rounded-full px-1"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              id={tabId(option.value)}
              aria-selected={selected}
              aria-controls={panel}
              onClick={() => onChange(option.value)}
              className="tap relative flex h-11 min-w-0 flex-1 items-center justify-center"
            >
              {selected && <motion.span aria-hidden="true" layoutId={lens}
                className="matte-reset absolute inset-x-0 inset-y-0.5 rounded-full bg-white shadow-card"
                transition={reduceMotion ? { duration: 0 } : SPRINGS.snappy} />}
              <span className={`segment-label relative flex h-9 items-center justify-center px-3.5 text-[14px] font-semibold ${
                selected ? "text-primary" : "text-muted"}`}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
