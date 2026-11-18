"use client";

/**
 * One transcript bubble. Plain text only — never HTML, never a markdown link. A URL in the text
 * renders as inert characters (spec "Client changes"), so a planted link cannot be tapped.
 *
 * The user's bubble is flat ink (`--grad-ink`, painted by the module's `.mine`) with white text; the
 * assistant's is the mist tile on white and a basalt card on the black ground
 * (components/CoachMessage.module.css). Body is 14 px/300, the DESIGN.md body-md token.
 */

import { motion, useReducedMotion } from "motion/react";
import AiLabel, { aiLabelCopy } from "@/components/ui/AiLabel";
import type { Provenance } from "@/lib/types";
import styles from "./CoachMessage.module.css";

// A bubble rises 8 px into place as it arrives — DESIGN.md §Motion, card entrance, shortened.
const RISE_EASE = [0.2, 0.8, 0.2, 1] as const;

export default function CoachMessage({
  role, content, pending, provenance,
}: {
  role: "user" | "assistant"; content: string; pending?: boolean;
  /** Who wrote an assistant reply (PR #373); an AI reply carries the AI label at its foot. */
  provenance?: Provenance;
}) {
  const mine = role === "user";
  /* A message that has not landed yet is the pale outline of the bubble it becomes, ink on paper, so
     it reads as "on its way" without dropping the words below 4.5:1 (the old 60 % fade did; Kimi
     audit 2026-10-04). */
  const pendingMine = mine && pending === true;
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={`flex ${mine ? "justify-end" : "justify-start"}`}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, ease: RISE_EASE }}
    >
      <div className={styles.bubble} data-pending={pending ? "true" : undefined} style={{ maxWidth: "82%" }}>
        <p
          className={`m-0 whitespace-pre-wrap break-words px-4 py-3 text-caption font-normal leading-label-md ${
            pendingMine ? `${styles.mine} ${styles.pending} text-charcoal`
              : mine ? `${styles.mine} text-on-primary` : `${styles.theirs} text-charcoal`
          }`}
        >
          {content}
          {/* In flow at the bubble's foot: it rides the bubble's own rise, with no motion of its own. */}
          {!mine && aiLabelCopy(provenance) && <span className="flex pt-2"><AiLabel provenance={provenance} /></span>}
        </p>
      </div>
    </motion.div>
  );
}
