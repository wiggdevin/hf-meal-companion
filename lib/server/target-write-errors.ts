/**
 * What a refused checked target write means to a caller (docs/specs/phase-12-coach-tools.md 1.5).
 * `write_target_revision_checked` raises SF001 `below_floor`, SF002 `profile_required` and SF004
 * (`kcal_mismatch`, `invalid_macros`); supabase-js hands each back as `{ code, message, details }`
 * with the SQLSTATE in `code` and the `detail` text in `details`.
 */
import { z } from "zod";
import { HttpError } from "@/lib/server/auth";

export type FloorKind = "kcal" | "fat" | "protein";
export type DayType = "training" | "rest";

export class TargetBelowFloorError extends HttpError {
  constructor(
    public readonly floor: FloorKind,
    public readonly dayType: DayType,
    public readonly minimum: number,
  ) {
    super(422, "below_floor", floor === "kcal"
      ? `That is below your minimum of ${minimum} kcal a day. Choose ${minimum} or more.`
      : floor === "fat"
        ? `That leaves less than ${minimum} g of fat a day. Choose a higher amount.`
        : `That is less than your minimum of ${minimum} g of protein a day. Choose ${minimum} g or more.`);
    this.name = "TargetBelowFloorError";
  }
}

const belowFloorDetail = z.object({
  floor: z.enum(["kcal", "fat", "protein"]),
  dayType: z.enum(["training", "rest"]),
  minimum: z.number().finite().nonnegative(),
});
const mismatchDetail = z.object({
  reason: z.enum(["kcal_mismatch", "invalid_macros", "negative_macro"]),
  dayType: z.enum(["training", "rest"]).optional(),
  kcal: z.number().finite().optional(),
  macroKcal: z.number().finite().optional(),
});

const dayLabel = (dayType: DayType | undefined) => (dayType === "training" ? "Training" : "Rest");

/** "Rest-day calories are too low for this protein and fat. Raise them or lower protein or fat." */
export function invalidMacrosError(dayType: DayType | undefined): HttpError {
  return new HttpError(422, "invalid_macros",
    `${dayLabel(dayType)}-day calories are too low for this protein and fat. `
    + "Raise them or lower protein or fat.");
}

function parseDetails(details: unknown): unknown {
  if (typeof details !== "string") return details;
  try {
    return JSON.parse(details);
  } catch {
    return undefined;
  }
}

function unreadable(code: string, error: unknown): HttpError {
  // Never a wrong message: an answer we cannot read is ours to fix (a 500, logged).
  console.error(`target write: ${code} with unreadable details`,
    JSON.stringify({ message: (error as { message?: unknown })?.message }));
  return new HttpError(500, "internal", "Something went wrong.", { cause: error });
}

/**
 * The error a caller throws for a failed checked write: the typed refusal for SF001, SF002 and
 * SF004, an unreadable refusal as a logged 500, and any other failure unchanged.
 */
export function mapTargetWriteError(error: unknown): unknown {
  const code = (error as { code?: unknown } | null)?.code;
  const details = (error as { details?: unknown } | null)?.details;
  if (code === "SF001") {
    const parsed = belowFloorDetail.safeParse(parseDetails(details));
    if (!parsed.success) return unreadable("SF001", error);
    return new TargetBelowFloorError(parsed.data.floor, parsed.data.dayType, parsed.data.minimum);
  }
  if (code === "SF002") {
    return new HttpError(409, "profile_required", "Finish your profile first.");
  }
  if (code === "SF004") {
    const parsed = mismatchDetail.safeParse(parseDetails(details));
    if (!parsed.success) return unreadable("SF004", error);
    const { reason, dayType, kcal, macroKcal } = parsed.data;
    if (reason === "kcal_mismatch") {
      if (macroKcal === undefined || kcal === undefined) return unreadable("SF004", error);
      return new HttpError(422, "kcal_mismatch",
        `Your calories and macros don't add up: they make ${Math.round(macroKcal)} kcal. `
        + "Change one of them.");
    }
    if (dayType === undefined) return unreadable("SF004", error);
    return invalidMacrosError(dayType);
  }
  return error;
}
