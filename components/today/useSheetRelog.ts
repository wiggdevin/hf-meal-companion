"use client";
/**
 * Fast logging (2026-11-21): the log sheet's half of a one-tap re-log. It shares the sheet's
 * `inFlight` guard and `submitting` state with logPicks, so a re-log, a pick and a meal save can
 * never run at once, and every re-log control is disabled while one is pending. Completion is
 * scoped to the sheet that started it: a sheet that closed meanwhile closes nothing and shows
 * nothing (Today keeps the batch and its Undo, components/today/useRelogBatches.ts).
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import type { ActionFeedbackNotice } from "@/components/ui/ActionFeedback";
import type { RelogStart } from "@/components/today/useRelogBatches";
import { currentAccountOrNull, isCurrent } from "@/lib/device/account";
import type { FavoriteRow } from "@/lib/favorites";
import { batchMessage } from "@/lib/log/relog-batch";
import { favoriteRelog, savedMealRefs } from "@/lib/log/quick-relog";
import type { LoggedFood, SlotId, StoredDay } from "@/lib/types";

export function useSheetRelog({ onRelog, onClose, notify, inFlightRef, setSubmitting, at, slot, days }: {
  onRelog?: RelogStart;
  onClose: () => void;
  notify: (notice: ActionFeedbackNotice) => void;
  inFlightRef: MutableRefObject<boolean>;
  setSubmitting: (on: boolean) => void;
  at?: Date;
  slot: SlotId;
  days: Record<string, StoredDay>;
}) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /** Sends the batch. The caller already holds `inFlightRef` when `claimed` is true. */
  async function relog(entries: LoggedFood[], durableKey?: string, claimed = false) {
    if (!onRelog || (!claimed && inFlightRef.current)) return;
    inFlightRef.current = true;
    setSubmitting(true);
    try {
      const batch = await onRelog(entries, { at, slot, durableKey });
      if (!alive.current) return;
      if (batch?.receipts.some((r) => r.state === "done" || r.state === "replayed")) { onClose(); return; }
      notify({ tone: "error", message: batch ? batchMessage(batch) : "That did not log. Try again." });
    } finally {
      inFlightRef.current = false;
      if (alive.current) setSubmitting(false);
    }
  }

  /** A star logged before, logged again at its last portion. False: the chip's old behaviour. */
  async function relogFavorite(fav: FavoriteRow): Promise<boolean> {
    if (!onRelog || fav.kind === "recipe") return false;
    if (inFlightRef.current) return true;
    // The guard is held across the saved-meal read: a second tap during it waits, not sends.
    inFlightRef.current = true;
    const account = currentAccountOrNull();
    let handedOn = false;
    try {
      const refs = fav.kind === "meal" ? await savedMealRefs(fav.id, account) : null;
      // The sheet closed, or the account changed, during the read: nothing is sent from here.
      if (!alive.current || !account || !isCurrent(account)) return true;
      const before = favoriteRelog(fav, days, refs);
      if (!before) return false;
      handedOn = true;
      await relog([before.entry], undefined, true);
      return true;
    } finally {
      if (!handedOn) inFlightRef.current = false;
    }
  }

  /** Whether a star could re-log at all; false keeps the chip's old behaviour synchronous. */
  const canRelog = (fav: FavoriteRow) => Boolean(onRelog) && fav.kind !== "recipe";

  return { relog, relogFavorite, canRelog };
}
