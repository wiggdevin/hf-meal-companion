"use client";

/**
 * Fast logging (2026-11-21): Today's one-tap way in. It opens the log sheet on the meal card that is
 * due now (or next; the first unticked one): the capture row, recents, favorites and search together. It wears the Week
 * link's pill beside it, so it adds no new colour, type or shape (DESIGN.md).
 */
export default function LogNowButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label="Log what you ate" aria-haspopup="dialog"
      className="tap flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-hairline border px-4 text-caption font-semibold text-charcoal">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      Log
    </button>
  );
}
