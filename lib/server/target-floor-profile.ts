import type { DeriveTargetRevisionInput } from "@/lib/profile/derive";

/**
 * The profile a first write can floor itself on while the settings op that stores it is still
 * queued behind it (onboarding posts the target first). `write_target_revision_checked` reads the
 * stored value first and uses this only for a field the account has no stored value for. It lives
 * apart from `targets.ts`, which keeps body-profile fields out of the target path
 * (lib/tdee.test.ts); this is the one place the floor reads them.
 */
export function floorProfileOf(settings: DeriveTargetRevisionInput["settings"]) {
  return { sex: settings.sex, birth_year: settings.birthYear, height_cm: settings.heightCm,
    weight_kg: settings.weightKg, goal: settings.goal };
}
