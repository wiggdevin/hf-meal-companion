"use client";

import { useEffect, useRef } from "react";

/**
 * Fast logging (2026-11-21): Today's one-tap way in. It opens the log sheet on the meal card that is
 * due now (or next; the first unticked one): the capture row, recents, favorites and search together. It wears the Week
 * link's pill beside it, so it adds no new colour, type or shape (DESIGN.md).
 *
 * Verify round: it announces a dialog only when it opens the modal sheet (no meal card to attach
 * to). When it opened the inset panel on a card, focus comes back to the pill as that panel closes.
 */
export default function LogNowButton({ onOpen, opensDialog = false, panelOpen = false }: {
  onOpen: () => void;
  /** True when the tap opens the modal log sheet, not the inset panel on a meal card. */
  opensDialog?: boolean;
  /** True while the log flow this button can open is showing. */
  panelOpen?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const openedInset = useRef(false);
  const wasOpen = useRef(panelOpen);
  useEffect(() => {
    if (wasOpen.current && !panelOpen && openedInset.current) {
      openedInset.current = false;
      button.current?.focus();
    }
    wasOpen.current = panelOpen;
  }, [panelOpen]);
  return (
    <button ref={button} type="button" aria-label="Log what you ate"
      onClick={() => { openedInset.current = !opensDialog; onOpen(); }}
      {...(opensDialog ? { "aria-haspopup": "dialog" as const } : {})}
      className="tap flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-hairline border px-4 text-caption font-semibold text-charcoal">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      Log
    </button>
  );
}
