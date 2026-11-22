"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { SECTION_LABEL_CLASS } from "@/components/LogFoodSheet.styles";
import { recentMeals } from "@/lib/log/recent-meals";
import { yesterdayInSlot } from "@/lib/log/quick-relog";
import { localIsoDate } from "@/lib/settings/date";
import { loadStore } from "@/lib/store";
import type { LoggedFood, SlotId } from "@/lib/types";

/** A long meal name wraps inside its chip, as the favorites chips do (components/FavoritesStrip.tsx). */
const WRAP = "h-auto max-w-full shrink-0 whitespace-normal py-1.5 text-left";

/**
 * Fast logging (2026-11-21): the log sheet's recents row. One tap logs a meal again at its last
 * foods and grams, with no portion step; "Same as yesterday" logs what this slot held yesterday.
 * The rows come from this account's own days on this phone (lib/log/recent-meals.ts) and are read
 * once, when the sheet opens. The chips are the favorites strip's: tertiary, small.
 */
export default function RecentMealsRow({ slot, at, busy, onRelog }: {
  slot: SlotId;
  /** The instant the log files at: a past day on Today, else now. */
  at?: Date;
  busy: boolean;
  onRelog: (entries: LoggedFood[]) => void;
}) {
  const [rows] = useState(() => {
    const days = loadStore().days;
    return { recents: recentMeals(days, { limit: 6 }), yesterday: yesterdayInSlot(days, localIsoDate(at ?? new Date()), slot) };
  });
  if (rows.recents.length === 0 && rows.yesterday.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`pl-1.5 ${SECTION_LABEL_CLASS}`}>Log again</span>
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1" aria-label="Recent meals">
        {rows.yesterday.length > 0 && (
          <Button variant="tertiary" size="sm" className={WRAP} disabled={busy} onClick={() => onRelog(rows.yesterday)}>
            Same as yesterday
          </Button>
        )}
        {rows.recents.map(({ entry }) => (
          <Button key={entry.id} variant="tertiary" size="sm" className={WRAP} disabled={busy}
            aria-label={`Log ${entry.name} again`} onClick={() => onRelog([entry])}>
            {entry.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
