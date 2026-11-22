// mapTargetWriteError: what each SQLSTATE of write_target_revision_checked means to a caller
// (docs/specs/phase-12-coach-tools.md 1.5). Migration 20270109100000.
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/server/auth";
import { mapTargetWriteError, TargetBelowFloorError } from "@/lib/server/target-write-errors";

const refusal = (code: string, details: unknown) => ({ code, message: "x", details });

afterEach(() => vi.restoreAllMocks());

describe("mapTargetWriteError", () => {
  it("maps SF001 to a below_floor error with the floor, the day and the minimum", () => {
    const e = mapTargetWriteError(refusal("SF001",
      JSON.stringify({ floor: "kcal", dayType: "training", minimum: 1430 })));
    expect(e).toBeInstanceOf(TargetBelowFloorError);
    expect(e).toMatchObject({ status: 422, code: "below_floor", floor: "kcal",
      dayType: "training", minimum: 1430,
      message: "That is below your minimum of 1430 kcal a day. Choose 1430 or more." });
  });

  it("words the fat and protein refusals as the spec does", () => {
    expect(mapTargetWriteError(refusal("SF001",
      JSON.stringify({ floor: "fat", dayType: "rest", minimum: 50 }))))
      .toMatchObject({ message: "That leaves less than 50 g of fat a day. Choose a higher amount." });
    expect(mapTargetWriteError(refusal("SF001",
      JSON.stringify({ floor: "protein", dayType: "rest", minimum: 145 }))))
      .toMatchObject({ message:
        "That is less than your minimum of 145 g of protein a day. Choose 145 g or more." });
  });

  it("maps SF002 to 409 profile_required", () => {
    expect(mapTargetWriteError(refusal("SF002", null))).toMatchObject({
      status: 409, code: "profile_required", message: "Finish your profile first." });
  });

  it("maps an SF004 mismatch to 422 kcal_mismatch with the calories the macros make", () => {
    expect(mapTargetWriteError(refusal("SF004", JSON.stringify(
      { reason: "kcal_mismatch", dayType: "training", kcal: 2000, macroKcal: 2120 })))).toMatchObject({
      status: 422, code: "kcal_mismatch",
      message: "Your calories and macros don't add up: they make 2120 kcal. Change one of them." });
  });

  it("maps a negative macro to 422 invalid_macros naming the day", () => {
    expect(mapTargetWriteError(refusal("SF004", JSON.stringify(
      { reason: "negative_macro", dayType: "rest" })))).toMatchObject({
      status: 422, code: "invalid_macros",
      message: "Rest-day calories are too low for this protein and fat. "
        + "Raise them or lower protein or fat." });
  });

  it.each([
    ["not JSON", "{oops"],
    ["a missing field", JSON.stringify({ floor: "kcal", dayType: "rest" })],
    ["an unknown floor", JSON.stringify({ floor: "carbs", dayType: "rest", minimum: 100 })],
    ["no details", null],
  ])("turns an SF001 with %s into a logged 500, never a wrong message", (_label, details) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const e = mapTargetWriteError(refusal("SF001", details));
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toMatchObject({ status: 500 });
    expect(e).not.toBeInstanceOf(TargetBelowFloorError);
    expect(log).toHaveBeenCalled();
  });

  it("turns an SF004 mismatch without its numbers into a logged 500", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(mapTargetWriteError(refusal("SF004", JSON.stringify({ reason: "kcal_mismatch" }))))
      .toMatchObject({ status: 500 });
  });

  it("returns any other failure unchanged", () => {
    const other = { code: "22023", message: "target_macros_required" };
    expect(mapTargetWriteError(other)).toBe(other);
    const plain = new Error("boom");
    expect(mapTargetWriteError(plain)).toBe(plain);
  });
});
