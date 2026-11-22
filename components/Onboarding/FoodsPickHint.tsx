"use client";

import { starterReadiness } from "@/lib/foods/starter-availability";
import type { Starter, StarterMark } from "@/lib/foods/starter";
import type { FoodRole } from "@/lib/foods";

const ROLE_LABEL: Record<FoodRole, { one: string; many: string }> = {
  protein: { one: "protein", many: "proteins" },
  carb: { one: "carb", many: "carbs" },
  fat: { one: "fat", many: "fats" },
};

/**
 * THE counter above the foods (one for the falling pile and the chips): what each group still
 * needs ("Pick 2 proteins"), judged by the same `starterReadiness` that gates Done, "Pick for me",
 * the reward preview and the save. When the person's food rules leave a group fewer than two
 * foods it says why the number is lower, and when they leave none it says the person can finish
 * without picking. One polite live region announces the change.
 *
 * `plannedMeals`: a legacy account needs one protein per planned meal (0 for a pilot account).
 */
export function FoodsPickHint({ choices, marks, plannedMeals = 0 }: {
  choices: readonly Starter[];
  marks: Record<string, StarterMark>;
  plannedMeals?: number;
}) {
  const readiness = starterReadiness(marks, choices, plannedMeals);
  const open = readiness.rows.filter((row) => row.left > 0);
  const limited = readiness.rows.filter((row) => row.available < 2);
  const say = (row: (typeof readiness.rows)[number]) =>
    `${row.left}${row.have > 0 ? " more" : ""} ${row.left === 1 ? ROLE_LABEL[row.role].one : ROLE_LABEL[row.role].many}`;
  return <div className="flex flex-col gap-1" data-testid="foods-pick-hint">
    <p role="status" aria-live="polite" className="m-0 text-caption text-graphite">
      {readiness.starterFree
        ? "Nothing fits your food rules right now, so there is nothing to pick. Tap Done to finish and add foods later."
        : open.length > 0 ? `Pick ${open.map(say).join(", ")} to finish.` : "That's enough. Tap Done when you're ready."}
    </p>
    <p className="m-0 text-caption text-graphite" aria-label="Picks so far">
      {readiness.rows.filter((row) => row.available > 0)
        .map((row) => `${ROLE_LABEL[row.role].many[0].toUpperCase()}${ROLE_LABEL[row.role].many.slice(1)} ${Math.min(row.have, row.need)}/${row.need}`)
        .join(" · ")}
    </p>
    {!readiness.starterFree && limited.map((row) => <p key={row.role} className="m-0 text-caption text-graphite">
      {row.available === 0
        ? `Your food rules leave no ${ROLE_LABEL[row.role].many}, so we'll skip them.`
        : `Your food rules leave only ${row.available} ${ROLE_LABEL[row.role].one}, so that's all you need.`}
    </p>)}
  </div>;
}
