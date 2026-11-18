import { HttpError, requireUser } from "@/lib/server/auth";
import { jsonError, readJson } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/ratelimit";
import { requestIp } from "@/lib/server/request-ip";
import { recordFeedback } from "@/lib/server/feedback";
import {
  FEEDBACK_BODY_MAX_BYTES, FEEDBACK_DAILY_LIMIT, FEEDBACK_LOG_PREFIX, FeedbackBody,
} from "@/lib/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const DAY_SECONDS = 24 * 60 * 60;

/**
 * POST /api/feedback — "Send feedback" from Settings (readiness audit 2026-11-17, A1).
 * Body `{ message, screen?, appBuild? }` (lib/feedback.ts), at most 9 KB.
 *
 * Order: 60/min per IP before auth; the session (401); the body (400 bad_request, 413); then 10 per
 * day per account (429 rate_limited; the shared Postgres limiter, fail closed: 503
 * rate_limit_unavailable), so a refused shape never spends a tester's daily count. The row is
 * written by lib/server/feedback.ts with the admin client and the session user id; accounts hold
 * no grant on the table (migration 20270108090000_feedback), so this limit cannot be bypassed. A failed insert answers 503 feedback_unavailable and
 * the phone keeps the typed text. Each saved row writes one `[feedback]` log line with the user
 * id, the message length and whether a screen was sent: never the text itself.
 *
 * 201 `{ status: "sent" }`. Always no-store.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    await enforceRateLimit(`feedback:pre:ip:${requestIp(req)}`, 60, 60);
    const { userId } = await requireUser(req);
    const body = await readJson(req, FeedbackBody, FEEDBACK_BODY_MAX_BYTES);
    await enforceRateLimit(`feedback:${userId}`, FEEDBACK_DAILY_LIMIT, DAY_SECONDS);
    try {
      await recordFeedback(userId, {
        message: body.message, screen: body.screen ?? null, appBuild: body.appBuild ?? null,
      });
    } catch (cause) {
      throw new HttpError(503, "feedback_unavailable", "Feedback could not be saved. Try again.", { cause });
    }
    console.info(FEEDBACK_LOG_PREFIX, JSON.stringify({
      userId, length: body.message.length, screen: body.screen ? true : false,
    }));
    return Response.json({ status: "sent" }, { status: 201, headers: NO_STORE });
  } catch (error) {
    const res = jsonError(error);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }
}
