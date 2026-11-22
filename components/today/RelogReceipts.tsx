"use client";
/**
 * Fast logging (2026-11-21): one card per re-log batch on Today, each with its own Undo and, when
 * part of it did not log, its own Try again (components/today/useRelogBatches.ts). The house
 * inline message card (components/ui/Notice.tsx); a later batch never replaces an earlier one.
 */
import Button from "@/components/ui/Button";
import Notice, { type NoticeTone } from "@/components/ui/Notice";
import { batchMessage, canRetry, canUndo, fullyUndone, type RelogBatch } from "@/lib/log/relog-batch";
import { NUTRITION_UNCHECKED_COPY } from "@/lib/nutrition-display";

function toneOf(batch: RelogBatch): NoticeTone {
  if (fullyUndone(batch)) return "neutral";
  if (canRetry(batch)) return canUndo(batch) ? "attention" : "error";
  return batch.warnings.length > 0 || batch.nutritionUnchecked || batch.note ? "attention" : "success";
}

export default function RelogReceipts({ batches, isRunning, onUndo, onRetry, onDismiss }: {
  batches: readonly RelogBatch[];
  isRunning: (opId: string) => boolean;
  onUndo: (opId: string) => void;
  onRetry: (opId: string) => void;
  onDismiss: (opId: string) => void;
}) {
  if (batches.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Re-logged meals">
      {batches.map((batch) => {
        const running = isRunning(batch.opId);
        const details = [batch.note, ...batch.warnings,
          batch.nutritionUnchecked ? NUTRITION_UNCHECKED_COPY : undefined].filter(Boolean);
        return (
          <div key={batch.opId} className="flex flex-col gap-1.5" data-relog-batch={batch.opId}>
            <Notice tone={toneOf(batch)} title={batchMessage(batch)} onDismiss={() => onDismiss(batch.opId)}>
              {details.length > 0 ? details.join(" ") : undefined}
            </Notice>
            {(canUndo(batch) || canRetry(batch)) && (
              <div className="flex gap-2 pl-1">
                {canRetry(batch) && <Button variant="secondary" size="sm" disabled={running}
                  onClick={() => onRetry(batch.opId)}>Try again</Button>}
                {canUndo(batch) && <Button variant="tertiary" size="sm" disabled={running}
                  onClick={() => onUndo(batch.opId)}>Undo</Button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
