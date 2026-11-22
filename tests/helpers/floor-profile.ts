/**
 * The profile the checked target writer reads (`write_target_revision_checked`, SF002 without one).
 * Tests that seed `target_profiles` by hand and then write through the app need it on
 * `user_settings` too. Local test stack only: callers pass the service-role test client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const FLOOR_PROFILE = {
  time_zone: "America/Denver", height_cm: 170.2, birth_year: 1968, sex: "female",
  weight_kg: 72.575, activity_level: "moderate", goal: "recomp", training_weekdays: [1, 3, 4, 5],
} as const;

export async function seedFloorProfile(
  admin: SupabaseClient, userId: string, over: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.from("user_settings").upsert({
    user_id: userId, first_opened_at: "2026-09-01T00:00:00Z", onboarded_at: "2026-09-02T00:00:00Z",
    ...FLOOR_PROFILE, ...over,
  });
  if (error) throw error;
}
