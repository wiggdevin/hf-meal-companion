import type { DeriveTargetRevisionInput } from "@/lib/profile/derive";

/**
 * The profile a first write can floor itself on while the settings op that stores it is still
 * queued behind it (onboarding posts the target first, a profile edit posts it before the settings
 * op). `write_target_revision_checked` judges height and goal on this profile when it is sent, and
 * the weight on it when no weigh-in exists; the stored value fills what is not sent. It lives
 * apart from `targets.ts`, which keeps body-profile fields out of the target path
 * (lib/tdee.test.ts); this is the one place the floor reads them.
 */
export function floorProfileOf(settings: DeriveTargetRevisionInput["settings"]) {
  return { sex: settings.sex, birth_year: settings.birthYear, height_cm: settings.heightCm,
    weight_kg: settings.weightKg, goal: settings.goal };
}
