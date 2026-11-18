"use client";

/**
 * Phone side of "Send feedback": `POST /api/feedback` mapped to what the sheet shows. Only `sent`
 * means the server saved it; every other outcome keeps the typed text on screen.
 */
import { FEEDBACK_PATH, type FeedbackBody } from "@/lib/feedback";
import {
  accountFetch, accountKey, currentAccountOrNull, rethrowAccountChanged, type AccountHandle,
} from "@/lib/device/account";

export type FeedbackOutcome = "sent" | "rate_limited" | "signed_out" | "failed";

export async function sendFeedback(
  h: AccountHandle, body: FeedbackBody, opts: { fetchImpl?: typeof fetch } = {},
): Promise<FeedbackOutcome> {
  try {
    const res = await accountFetch(h, FEEDBACK_PATH, {
      method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }, { budget: "prefs", fetchImpl: opts.fetchImpl });
    if (res.status === 201) return "sent";
    if (res.status === 429) return "rate_limited";
    if (res.status === 401) return "signed_out";
    return "failed";
  } catch (e) {
    rethrowAccountChanged(e);
    return "failed";
  }
}

/**
 * The last app screen this page showed before Settings, for the sheet's "include the screen I was
 * on" toggle. Memory only (this page load), set by AppChrome on each navigation.
 */
let lastScreen: string | null = null;

export function noteScreen(pathname: string | null): void {
  if (!pathname || pathname === "/settings" || pathname.startsWith("/settings/")) return;
  lastScreen = pathname;
}

export function lastScreenBeforeSettings(): string | null {
  return lastScreen;
}

/**
 * The unsent feedback draft, kept for the tab's session under the bound account
 * (`smc:u:<id>:feedback-draft`, as lib/recipes/session-checks.ts does) so a remount or a reload
 * never loses typed text, and the next account on the device never sees it. No bound account or
 * blocked storage reads as empty and drops the write.
 */
function feedbackDraftKey(): string | null {
  const h = currentAccountOrNull();
  return h === null ? null : accountKey(h, "feedback-draft");
}

export function readFeedbackDraft(): string {
  const key = feedbackDraftKey();
  if (key === null) return "";
  try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; }
}

export function writeFeedbackDraft(text: string): void {
  const key = feedbackDraftKey();
  if (key === null) return;
  try {
    if (text === "") sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, text);
  } catch { /* storage is optional */ }
}
