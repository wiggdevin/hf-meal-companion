"use client";
/**
 * Fast logging (2026-11-21): Today's re-log batches. Every tap is its own batch with its own
 * receipts, Undo and Retry (lib/log/relog-batch.ts), listed until dismissed, so a second re-log
 * never takes the first one's Undo away. The batches live here, on Today, not in the sheet that
 * started them: closing the sheet must not lose what was logged. A tap whose batch is still listed
 * (the same durable ids) resumes it: the receipts keep the proof of what that batch created, and a
 * second tap never earns a second Undo. The durable ids' generations live in account storage
 * (lib/log/relog-batch.ts), so a re-log after an Undo or a delete gets new ids in every tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { currentAccountOrNull } from "@/lib/device/account";
import { planRelog, runRelog, undoRelog, type RelogBatch, type RelogDeps } from "@/lib/log/relog-batch";
import type { LoggedFood, SlotId } from "@/lib/types";

export type RelogStart = (entries: LoggedFood[], opts: { at?: Date; slot?: SlotId; durableKey?: string })
  => Promise<RelogBatch | null>;

export function useRelogBatches(onChange: () => void, deps: RelogDeps = {}) {
  const [batches, setBatches] = useState<RelogBatch[]>([]);
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const busy = useRef(new Set<string>());
  const changeRef = useRef(onChange);
  const depsRef = useRef(deps);
  // The list as last committed, for a tap that must find its own batch before any await.
  const listRef = useRef<RelogBatch[]>([]);
  useEffect(() => { changeRef.current = onChange; depsRef.current = deps; listRef.current = batches; });

  const put = useCallback((batch: RelogBatch) => {
    const merge = (list: RelogBatch[]) => list.some((b) => b.opId === batch.opId)
      ? list.map((b) => (b.opId === batch.opId ? batch : b)) : [...list, batch];
    listRef.current = merge(listRef.current);
    setBatches(merge);
  }, []);

  const claim = (key: string) => {
    if (busy.current.has(key)) return false;
    busy.current.add(key); setRunning(new Set(busy.current));
    return true;
  };
  const release = (key: string) => { busy.current.delete(key); setRunning(new Set(busy.current)); };

  const start: RelogStart = useCallback(async (entries, opts) => {
    // One tap at a time per account and key: the account is in the key, so a tap after a switch
    // is never held behind the old account's.
    const key = `${currentAccountOrNull()?.userId ?? "none"}:${opts.durableKey ?? "relog"}`;
    if (!claim(key)) return null;
    try {
      const planned = await planRelog(entries, opts);
      const listed = listRef.current.find((b) => b.opId === planned.opId);
      // The same batch again: resume it, under its own proof, and never replace its receipts.
      const done = await runRelog(listed ?? planned, depsRef.current);
      put(done);
      changeRef.current();
      return done;
    } catch {
      return null;
    } finally {
      release(key);
    }
  }, [put]);

  const act = useCallback(async (opId: string, step: "retry" | "undo") => {
    const batch = listRef.current.find((b) => b.opId === opId);
    if (!batch || !claim(opId)) return;
    try {
      const next = step === "undo" ? await undoRelog(batch, depsRef.current) : await runRelog(batch, depsRef.current);
      put(next);
      changeRef.current();
    } finally {
      release(opId);
    }
  }, [put]);

  const dismiss = useCallback((opId: string) => setBatches((list) => list.filter((b) => b.opId !== opId)), []);

  return {
    batches,
    /** A re-log or an Undo/Retry is running: every re-log control waits. */
    pending: running.size > 0,
    isRunning: (opId: string) => running.has(opId),
    start,
    retry: (opId: string) => act(opId, "retry"),
    undo: (opId: string) => act(opId, "undo"),
    dismiss,
  };
}
