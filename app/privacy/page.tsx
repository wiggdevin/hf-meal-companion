import type { Metadata } from "next";
import PrivacyNotice from "@/components/privacy/PrivacyNotice";
import { accountDeletionEnabled } from "@/lib/server/account-deletion-flag";

export const metadata: Metadata = { title: "Privacy" };

/**
 * GET /privacy — the public privacy page (readiness audit 2026-11-17, A2). Open without a session:
 * middleware.ts and AuthGate exempt it, as they exempt /sign-in. The wording comes only from
 * docs/ai-data-handling.md and the code (the Settings processor list, the deletion list); keep it in
 * step with them. It says "Test version" and makes no legal claim.
 */
export default function PrivacyPage() {
  return <PrivacyNotice deletionEnabled={accountDeletionEnabled()} />;
}
