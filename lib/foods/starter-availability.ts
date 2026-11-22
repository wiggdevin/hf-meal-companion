import { starterRoleRequirement, type Starter, type StarterMark } from "./starter";
import type { FoodRole } from "@/lib/foods";

const ROLES = ["protein", "carb", "fat"] as const satisfies readonly FoodRole[];

/**
 * The daily layout uses a different protein for each generated meal, but never asks for more
 * proteins than the account's rules leave: the requirement is capped at the eligible proteins
 * (zero eligible proteins: nothing to require), so hard food rules can never strand a person.
 */
export function starterProteinAvailability(
  marks: Readonly<Record<string, StarterMark>>,
  choices: readonly Starter[],
  required: number,
): { selected: number; eligible: number; required: number; ready: boolean } {
  const proteins = choices.filter((item) => item.role === "protein");
  const selected = proteins.filter((item) => marks[item.id] === "eats").length;
  const capped = Math.min(Math.max(0, required), proteins.length);
  return { selected, eligible: proteins.length, required: capped, ready: selected >= capped };
}

export type StarterRoleReadiness = {
  role: FoodRole; need: number; have: number; available: number; left: number;
};

export type StarterReadiness = {
  /** Every group has what it needs (or nothing eligible to need). */
  ready: boolean;
  /** No food is eligible: the person finishes without picking and adds foods later. */
  starterFree: boolean;
  rows: StarterRoleReadiness[];
  /** The legacy per-meal protein need (already capped at the eligible proteins); 0 elsewhere. */
  proteins: { selected: number; eligible: number; required: number; ready: boolean };
};

/**
 * THE readiness answer for the Foods step: the hint, "Done", "Pick for me", the reward preview,
 * "Use this plan" and the save (lib/onboarding/save-plan.ts) all call this one function, so they
 * can never disagree. `choices` is the eligible list the shared policy evaluator allowed; only a
 * pick inside it counts. Each group needs two foods, or every food it has when the rules leave
 * fewer. A legacy account also needs one distinct protein per planned meal (`plannedMeals`), capped
 * at the proteins it can have. `plannedMeals` is 0 for a pilot account.
 */
export function starterReadiness(
  marks: Readonly<Record<string, StarterMark>>,
  choices: readonly Starter[],
  plannedMeals = 0,
): StarterReadiness {
  const proteins = starterProteinAvailability(marks, choices, plannedMeals);
  const rows = ROLES.map((role) => {
    // The protein group also carries the legacy one-per-planned-meal need (already capped).
    const need = Math.max(starterRoleRequirement(role, choices), role === "protein" ? proteins.required : 0);
    const available = choices.filter((item) => item.role === role).length;
    const have = choices.filter((item) => item.role === role && marks[item.id] === "eats").length;
    return { role, need, have, available, left: Math.max(0, need - have) };
  });
  return {
    ready: rows.every((row) => row.left === 0),
    starterFree: choices.length === 0,
    rows,
    proteins,
  };
}

/** The eligible foods a save writes: marked "eats", and inside the eligible list. */
export function starterEatsIds(
  marks: Readonly<Record<string, StarterMark>>, choices: readonly Starter[],
): string[] {
  return choices.filter((item) => marks[item.id] === "eats").map((item) => item.id);
}
