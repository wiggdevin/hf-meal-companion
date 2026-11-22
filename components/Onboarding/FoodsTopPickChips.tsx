"use client";

/**
 * Onboarding v2 lane 4 (BRIEF §4 "1:10–1:35", Resolved conflict #4): the pilot/open-world
 * equivalent of the legacy falling-food game — no new game surface, same safety-filtered starter
 * list (`choices`, already run through `starterChoices`), rendered as simple top-pick chips.
 * Owner-adopted default (LANES.md): pilot/open-world accounts get this, not the untested game.
 *
 * `choices` carries the same allergy exclusion the legacy game relies on — a confirmed allergy
 * removes the matching chip before this list ever renders, not after.
 */
import { dbFood } from "@/lib/food-db";
import { starterRoleRequirement, type Starter, type StarterMark } from "@/lib/foods/starter";
import { starterVarietyOrder } from "@/lib/foods/starter-variety";
import type { FoodRole } from "@/lib/foods";
import Button from "@/components/ui/Button";

const ROLES: readonly FoodRole[] = ["protein", "carb", "fat"];
/** Per role, so a clear profile (all-protein defaults happen to lead the STARTERS table) still
 *  offers something to love across every role, not 12 proteins and nothing else (GPT-6 Sol r1
 *  WARN — ran `topPickChoices` against a clear profile and got zero carbs, zero fats). */
const PER_ROLE_LIMIT = 4;

export function topPickChoices(choices: readonly Starter[]): Starter[] {
  const picks: Starter[] = [];
  for (const role of ROLES) {
    const inRole = choices.filter((item) => item.role === role);
    const defaults = inRole.filter((item) => item.default);
    const rest = inRole.filter((item) => !item.default);
    // Plate-variety order (onb3): four carbs used to be four starches, never a vegetable.
    picks.push(...starterVarietyOrder([...defaults, ...rest]).slice(0, PER_ROLE_LIMIT));
  }
  return picks;
}

const ROLE_LABEL: Record<FoodRole, { one: string; many: string }> = {
  protein: { one: "protein", many: "proteins" },
  carb: { one: "carb", many: "carbs" },
  fat: { one: "fat", many: "fats" },
};

/**
 * The counter and hint above the foods: how many each group still needs ("Pick 2 proteins"), and,
 * when the person's food rules leave a group fewer than two foods, a plain line saying why the
 * number is lower (or the group is skipped). Without it "Done" only appeared, silently, after two
 * picks per group (W062 WARN 2).
 */
export function FoodsPickHint({ choices, marks }: {
  choices: readonly Starter[];
  marks: Record<string, StarterMark>;
}) {
  const rows = ROLES.map((role) => {
    const need = starterRoleRequirement(role, choices);
    const have = choices.filter((item) => item.role === role && marks[item.id] === "eats").length;
    const available = choices.filter((item) => item.role === role).length;
    return { role, need, have, available, left: Math.max(0, need - have) };
  });
  const open = rows.filter((row) => row.left > 0);
  const limited = rows.filter((row) => row.available < 2);
  const say = (row: (typeof rows)[number]) =>
    `${row.left}${row.have > 0 ? " more" : ""} ${row.left === 1 ? ROLE_LABEL[row.role].one : ROLE_LABEL[row.role].many}`;
  return <div className="flex flex-col gap-1" data-testid="foods-pick-hint">
    <p role="status" className="m-0 text-caption text-graphite">
      {choices.length === 0
        ? "Your food rules leave nothing to suggest right now, so you can finish and add foods later."
        : open.length > 0 ? `Pick ${open.map(say).join(", ")} to finish.` : "That's enough. Tap Done when you're ready."}
    </p>
    <p className="m-0 text-caption text-graphite" aria-label="Picks so far">
      {rows.filter((row) => row.available > 0)
        .map((row) => `${ROLE_LABEL[row.role].many[0].toUpperCase()}${ROLE_LABEL[row.role].many.slice(1)} ${row.have}/${row.need}`)
        .join(" · ")}
    </p>
    {choices.length > 0 && limited.map((row) => <p key={row.role} className="m-0 text-caption text-graphite">
      {row.available === 0
        ? `Your food rules leave no ${ROLE_LABEL[row.role].many}, so we'll skip them.`
        : `Your food rules leave only ${row.available} ${ROLE_LABEL[row.role].one}, so that's all you need.`}
    </p>)}
  </div>;
}

export default function FoodsTopPickChips({ choices, marks, onMark }: {
  choices: readonly Starter[];
  marks: Record<string, StarterMark>;
  onMark: (id: string, mark: StarterMark) => void;
}) {
  const picks = topPickChoices(choices);
  return <div className="flex flex-col gap-3" data-testid="foods-top-pick-chips">
    <p className="m-0 text-caption text-graphite">Tap the ones you love most.</p>
    <FoodsPickHint choices={choices} marks={marks} />
    <div className="flex flex-wrap gap-2">
      {picks.map((item) => {
        const name = dbFood(item.id)?.name ?? item.id;
        const loved = marks[item.id] === "eats";
        return <Button key={item.id} size="sm" variant={loved ? "primary" : "tertiary"}
          className="rounded-full" aria-label={`Love ${name}`} aria-pressed={loved}
          onClick={() => onMark(item.id, loved ? "neutral" : "eats")}>
          {name}
        </Button>;
      })}
    </div>
  </div>;
}
