"use client";
/**
 * Fast logging (2026-11-21): Today's re-log batches. Every tap is its own batch with its own
 * receipts, Undo and Retry (lib/log/relog-batch.ts), listed until dismissed, so a second re-log
 * never takes the first one's Undo away. The batches live here, on Today, not in the sheet that
 * started them: closing the sheet must not lose what was logged.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fullyUndone, planRelog, runRelog, undoRelog, type RelogBatch, type RelogDeps,
} from "@/lib/log/relog-batch";
import type { LoggedFood, SlotId } from "@/lib/types";

export type RelogStart = (entries: LoggedFood[], opts: { at?: Date; slot?: SlotId; durableKey?: string })
  => Promise<RelogBatch | null>;

export function useRelogBatches(onChange: () => void, deps: RelogDeps = {}) {
  const [batches, setBatches] = useState<RelogBatch[]>([]);
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const busy = useRef(new Set<string>());
  // A durable key whose batch was undone here: the same ids are deleted on the server now, so the
  // next tap is a new operation, not that one again.
  const generation = useRef(new Map<string, number>());
  const changeRef = useRef(onChange);
  const depsRef = useRef(deps);
  useEffect(() => { changeRef.current = onChange; depsRef.current = deps; });

  const put = useCallback((batch: RelogBatch) => setBatches((list) => list.some((b) => b.opId === batch.opId)
    ? list.map((b) => (b.opId === batch.opId ? batch : b)) : [...list, batch]), []);

  const claim = (key: string) => {
    if (busy.current.has(key)) return false;
    busy.current.add(key); setRunning(new Set(busy.current));
    return true;
  };
  const release = (key: string) => { busy.current.delete(key); setRunning(new Set(busy.current)); };

  const start: RelogStart = useCallback(async (entries, opts) => {
    const n = opts.durableKey ? generation.current.get(opts.durableKey) ?? 0 : 0;
    const durableKey = opts.durableKey && n > 0 ? `${opts.durableKey}:${n}` : opts.durableKey;
    const key = durableKey ?? "relog";
    if (!claim(key)) return null;
    try {
      const planned = await planRelog(entries, { ...opts, durableKey });
      const done = await runRelog(planned, depsRef.current);
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
    const batch = batches.find((b) => b.opId === opId);
    if (!batch || !claim(opId)) return;
    try {
      const next = step === "undo" ? await undoRelog(batch, depsRef.current) : await runRelog(batch, depsRef.current);
      if (step === "undo" && fullyUndone(next)) {
        const base = next.opId.split(":").slice(0, 3).join(":");
        if (base.startsWith("same-as-yesterday:")) generation.current.set(base, (generation.current.get(base) ?? 0) + 1);
      }
      put(next);
      changeRef.current();
    } finally {
      release(opId);
    }
  }, [batches, put]);

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
