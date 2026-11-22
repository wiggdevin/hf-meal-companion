"use client";
/**
 * Fast logging (2026-11-21): "Same as yesterday" on an empty meal card. It says, before the tap,
 * which of yesterday's entries in this slot it copies and which it leaves out (a meal still saving
 * or one that cannot be rebuilt), and waits while any re-log is running.
 */
import { useId } from "react";
import Button from "@/components/ui/Button";
import { sameAsYesterdayCopy, type YesterdayInSlot } from "@/lib/log/quick-relog";

export default function SameAsYesterday({ copy, omitted, busy, onLog }: YesterdayInSlot & {
  busy: boolean;
  onLog: () => void;
}) {
  const id = useId();
  if (copy.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <Button block variant="tertiary" disabled={busy} aria-describedby={id} onClick={onLog}>Same as yesterday</Button>
      <p id={id} className="m-0 px-1 text-caption text-text-hint">{sameAsYesterdayCopy({ copy, omitted })}</p>
    </div>
  );
}
