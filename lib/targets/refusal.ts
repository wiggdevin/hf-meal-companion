/**
 * What the phone does with a refused target save (docs/specs/phase-12-coach-tools.md 1.5).
 * `POST /api/targets` answers a refusal as `{ error: <code>, message?, ... }`. A `below_floor`
 * answer carries the floor, the day type and the minimum, and the server's own sentence; the
 * phone shows that sentence unchanged, so the client and the server never word a floor twice.
 */
import { accountJson, rethrowAccountChanged, type AccountHandle } from "@/lib/device/account";

/**
 * A refusal the server explained with a code (onboarding v2: `422 adult_only` under 18,
 * `409 rate_not_eligible` for a held pace). The message keeps the old "save targets failed: N"
 * shape so every existing reader is unchanged.
 */
export class TargetSaveRefusedError extends Error {
  constructor(readonly status: number, readonly code: string | null) {
    super(`save targets failed: ${status}`);
    this.name = "TargetSaveRefusedError";
  }
}

export type FloorKind = "kcal" | "fat" | "protein";
export type FloorDayType = "training" | "rest";

/**
 * `422 below_floor`: the targets are under a minimum. `message` is the server's sentence, ready to
 * show. A refusal is final: the same body would be refused again, so it is never queued for retry.
 */
export class TargetFloorError extends TargetSaveRefusedError {
  constructor(
    readonly floor: FloorKind,
    readonly dayType: FloorDayType,
    readonly minimum: number,
    message: string,
  ) {
    super(422, "below_floor");
    this.message = message;
    this.name = "TargetFloorError";
  }
}

/**
 * `422 kcal_mismatch` or `422 invalid_macros`: the calories and the macros do not agree. Like a
 * floor refusal it is final (the same body is refused again) and carries the server's sentence.
 */
export class TargetMacroError extends TargetSaveRefusedError {
  constructor(code: "kcal_mismatch" | "invalid_macros", message: string) {
    super(422, code);
    this.message = message;
    this.name = "TargetMacroError";
  }
}

/** A refusal that never succeeds on a retry, so it is never queued and a queued copy is dropped. */
export function isFinalRefusal(error: unknown): error is TargetFloorError | TargetMacroError {
  return error instanceof TargetFloorError || error instanceof TargetMacroError;
}

const FLOORS: readonly string[] = ["kcal", "fat", "protein"];
const DAY_TYPES: readonly string[] = ["training", "rest"];

function floorErrorFrom(body: Record<string, unknown>): TargetFloorError | null {
  const { floor, dayType, minimum, message } = body;
  if (typeof floor !== "string" || !FLOORS.includes(floor)) return null;
  if (typeof dayType !== "string" || !DAY_TYPES.includes(dayType)) return null;
  if (typeof minimum !== "number" || !Number.isFinite(minimum)) return null;
  if (typeof message !== "string" || message.length === 0) return null;
  return new TargetFloorError(floor as FloorKind, dayType as FloorDayType, minimum, message);
}

/** The error for a 4xx answer to a target save: typed when the body says why, else a plain refusal. */
export async function targetRefusal(
  h: AccountHandle, response: Response,
): Promise<TargetSaveRefusedError> {
  let body: Record<string, unknown> | null = null;
  try {
    const parsed = await accountJson<unknown>(h, response);
    body = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch (e) {
    rethrowAccountChanged(e);
  }
  const code = typeof body?.error === "string" ? body.error : null;
  if (code === "below_floor" && body) {
    const floor = floorErrorFrom(body);
    if (floor) return floor;
  }
  if ((code === "kcal_mismatch" || code === "invalid_macros") && typeof body?.message === "string"
      && body.message.length > 0) {
    return new TargetMacroError(code, body.message);
  }
  return new TargetSaveRefusedError(response.status, code);
}

/** The sentence to show for a failed save: the server's own for a final refusal, else `fallback`. */
export function refusalMessage(error: unknown, fallback: string): string {
  return isFinalRefusal(error) ? error.message : fallback;
}

/**
 * An Undo that restores an older target the server now refuses (a weigh-in or a profile change
 * since put it under a minimum). The refusal's sentence is shown after a lead that says the Undo
 * did not happen; any other error passes through unchanged.
 */
export async function undoRestore<T>(restore: () => Promise<T>): Promise<T> {
  try {
    return await restore();
  } catch (error) {
    if (isFinalRefusal(error)) {
      throw new Error(`Couldn't undo this: ${error.message}`, { cause: error });
    }
    throw error;
  }
}
