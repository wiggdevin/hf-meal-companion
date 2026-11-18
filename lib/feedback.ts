/**
 * The "Send feedback" wire contract (readiness audit 2026-11-17, A1), shared by the Settings sheet
 * (components/settings/FeedbackCard.tsx) and `POST /api/feedback`.
 *
 * Body `{ message, screen?, appBuild? }`: the tester's own words (1 to 2,000 characters after
 * trimming), the app path they were on (a path only, never a query string or hash, and only when
 * they turned the toggle on) and the build sha. Nothing else is accepted.
 */
import { z } from "zod";

export const FEEDBACK_MAX_CHARS = 2_000;
/** 2,000 characters at up to 4 UTF-8 bytes each, plus the JSON around them. */
export const FEEDBACK_BODY_MAX_BYTES = 9_000;
/** Feedback rows per account per day (`POST /api/feedback`). */
export const FEEDBACK_DAILY_LIMIT = 10;
export const FEEDBACK_PATH = "/api/feedback";
/** The prefix of the one log line each saved feedback writes (search Vercel runtime logs for it). */
export const FEEDBACK_LOG_PREFIX = "[feedback]";

const SCREEN = /^\/[A-Za-z0-9/_-]{0,199}$/;
const BUILD = /^[A-Za-z0-9._-]{1,64}$/;

export const FeedbackBody = z.object({
  message: z.string().trim().min(1).max(FEEDBACK_MAX_CHARS),
  screen: z.string().regex(SCREEN).nullable().optional(),
  appBuild: z.string().regex(BUILD).nullable().optional(),
}).strict();
export type FeedbackBody = z.infer<typeof FeedbackBody>;

/** The path part of a pathname, or null when it is not a plain app path. */
export function feedbackScreen(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string") return null;
  const path = pathname.split(/[?#]/)[0] ?? "";
  return SCREEN.test(path) ? path : null;
}
