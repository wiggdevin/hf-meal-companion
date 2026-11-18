import "server-only";

/**
 * The store behind `POST /api/feedback` (readiness audit 2026-11-17, A1). One insert into
 * `feedback` with the admin client and the session-verified user id: `authenticated` holds no
 * grant on the table (migration 20270108090000_feedback), so the route's rate limit is the only
 * way in. The caller's body never names the owner.
 */
import { adminClient } from "@/lib/server/admin";

export type FeedbackRow = { message: string; screen: string | null; appBuild: string | null };

export class FeedbackStoreError extends Error {
  constructor(public readonly code: string) {
    super(`feedback insert failed (${code})`);
    this.name = "FeedbackStoreError";
  }
}

export async function recordFeedback(userId: string, row: FeedbackRow): Promise<void> {
  const { error } = await adminClient().from("feedback").insert({
    user_id: userId, message: row.message, screen: row.screen, app_build: row.appBuild,
  });
  if (error) throw new FeedbackStoreError(error.code ?? "unknown");
}
