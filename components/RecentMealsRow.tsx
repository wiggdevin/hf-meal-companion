"use client";

import { useId, useMemo } from "react";
import Button from "@/components/ui/Button";
import { SECTION_LABEL_CLASS } from "@/components/LogFoodSheet.styles";
import { recentMeals } from "@/lib/log/recent-meals";
import { relogDetail, sameAsYesterdayCopy, sameAsYesterdayKey, yesterdayInSlot } from "@/lib/log/quick-relog";
import { localIsoDate } from "@/lib/settings/date";
import type { LoggedFood, SlotId, StoredDay } from "@/lib/types";

/** A long meal name wraps inside its chip, as the favorites chips do (components/FavoritesStrip.tsx). */
const WRAP = "h-auto max-w-full shrink-0 flex-col items-start whitespace-normal py-1.5 text-left";

/**
 * Fast logging (2026-11-21): the log sheet's recents row. One tap logs a meal again at its last
 * foods and grams, with no portion step; "Same as yesterday" logs what this slot held yesterday and
 * says what it copies and leaves out. The rows come from this account's days as Today holds them
 * (`days`, the synced store), recomputed when the slot, the day or the store changes. Each chip
 * names its portion and its day. The chips are the favorites strip's: tertiary, small.
 */
export default function RecentMealsRow({ days, slot, at, busy, onRelog }: {
  days: Record<string, StoredDay>;
  slot: SlotId;
  /** The instant the log files at: a past day on Today, else now. */
  at?: Date;
  busy: boolean;
  onRelog: (entries: LoggedFood[], durableKey?: string) => void;
}) {
  const id = useId();
  const day = localIsoDate(at ?? new Date());
  const today = localIsoDate(new Date());
  const rows = useMemo(() => ({
    recents: recentMeals(days, { limit: 6 }),
    // A day not lived yet has no "yesterday" to copy into it, as on Today's card.
    yesterday: day <= today ? yesterdayInSlot(days, day, slot) : { copy: [], omitted: [] },
  }), [days, day, slot, today]);
  const { recents, yesterday } = rows;
  if (recents.length === 0 && yesterday.copy.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`pl-1.5 ${SECTION_LABEL_CLASS}`} id={`${id}-label`}>Log again</span>
      <div role="group" aria-labelledby={`${id}-label`}
        className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
        {yesterday.copy.length > 0 && (
          <Button variant="tertiary" size="sm" className={WRAP} disabled={busy}
            aria-describedby={`${id}-copy`}
            onClick={() => onRelog(yesterday.copy, sameAsYesterdayKey(day, slot))}>
            Same as yesterday
          </Button>
        )}
        {recents.map((meal) => (
          <Button key={meal.entry.id} variant="tertiary" size="sm" className={WRAP} disabled={busy}
            aria-label={`Log ${meal.entry.name} again, ${relogDetail(meal, day)}`} onClick={() => onRelog([meal.entry])}>
            <span>{meal.entry.name}</span>
            <span className="text-caption text-text-hint">{relogDetail(meal, day)}</span>
          </Button>
        ))}
      </div>
      {yesterday.copy.length > 0 && (
        <p id={`${id}-copy`} className="m-0 pl-1.5 text-caption text-text-hint">
          {`Same as yesterday: ${sameAsYesterdayCopy(yesterday)}`}
        </p>
      )}
    </div>
  );
}
