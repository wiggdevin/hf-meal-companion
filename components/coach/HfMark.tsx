"use client";

/**
 * The assistant's living mark (U21, 2026-10-04), in the High Frequency brand (2026-11-18): the HF
 * monogram on a round card. At rest it breathes slowly; while a turn is in flight the same loop runs
 * three times faster. The speed changes through `playbackRate`, so the mark speeds up from where it is
 * instead of jumping to a new frame. Reduced motion: the monogram sits still. The export keeps its
 * name; the component is `HfLogo`'s monogram with the coach's motion.
 */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import HfLogo from "@/components/brand/HfLogo";
import styles from "./CoachHeader.module.css";

/** How much faster the mark moves while the assistant works. */
export const THINKING_RATE = 3;

export default function HfMark({ thinking = false, size = 32 }: { thinking?: boolean; size?: number }) {
  const reduce = useReducedMotion() === true;
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const animations = root.current?.getAnimations?.({ subtree: true }) ?? [];
    for (const animation of animations) animation.updatePlaybackRate(thinking ? THINKING_RATE : 1);
  }, [thinking, reduce]);
  return <span ref={root} className={styles.mark} data-thinking={thinking ? "true" : undefined}
    data-motion={reduce ? "reduced" : "full"} aria-hidden="true">
    <span className={styles.glyph}>
      <HfLogo variant="monogram" tone="light" height={Math.round(size * 0.6)} decorative />
    </span>
  </span>;
}
