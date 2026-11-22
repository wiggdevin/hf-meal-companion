"use client";

/**
 * Fast logging: Today's half of the `/log` deep link (lib/log/log-intent.ts). Once the page is
 * mounted it reads `?log=…` (or a request held across onboarding), removes it from the address,
 * and asks the page to open the capture. It opens a sheet only: every AI capture still proposes
 * and waits for the user to confirm (F-073).
 *
 * It answers every request, not only the first: a second `/log` link that lands on a Today that is
 * already mounted (a client navigation, or the address changed by a shortcut) is read the same way.
 * The address is the latch: a request is cleared from it as it is handled, so the same request is
 * never opened twice, and an address with no request handles nothing.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { CaptureMethod } from "@/lib/capture/flags";
import { takeHeldLogIntent } from "@/lib/log/held-log-intent";
import { parseLogIntent, resolveLogIntent, withoutLogIntent, type LogIntent, type LogOpen } from "@/lib/log/log-intent";
import type { SlotId } from "@/lib/types";

export type LogRequest = { open: LogOpen; slot: SlotId | null };

/** Reads and clears this window's log request. Null when there is none. */
function takeAddressIntent(): LogIntent | null {
  const { pathname, search } = window.location;
  const intent = parseLogIntent(search, pathname);
  if (!intent) return null;
  const url = new URL(window.location.href);
  const rest = withoutLogIntent(search, pathname);
  url.pathname = rest.pathname;
  url.search = rest.search;
  window.history.replaceState(window.history.state, "", url);
  return intent;
}

export function useLogIntent(
  ready: boolean,
  enabled: { methods: readonly CaptureMethod[]; scan: boolean },
  open: (request: LogRequest) => void,
): void {
  const pathname = usePathname();
  const latest = useRef({ enabled, open });
  // A layout effect runs before every passive effect, so the read below sees this render's values.
  useLayoutEffect(() => { latest.current = { enabled, open }; });

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const handle = (): void => {
      if (!alive) return;
      const intent = takeAddressIntent() ?? takeHeldLogIntent();
      if (!intent) return;
      latest.current.open({ open: resolveLogIntent(intent.mode, latest.current.enabled), slot: intent.slot });
    };
    handle();
    // Back or Forward onto an address that carries a request (a history entry pushed before this
    // page cleared its own) is a request too.
    window.addEventListener("popstate", handle);
    return () => { alive = false; window.removeEventListener("popstate", handle); };
    // `pathname` re-runs the read after a client navigation lands on Today with a new request.
  }, [ready, pathname]);
}
