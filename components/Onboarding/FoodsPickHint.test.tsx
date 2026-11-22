// @vitest-environment jsdom
/** W062 WARN 2: the Foods beat says how many picks are still needed, and why a group needs fewer. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FoodsPickHint } from "./FoodsTopPickChips";
import { STARTERS, starterChoices } from "@/lib/foods/starter";

const rules = { avoid_allergens: [], avoid_food_ref_ids: [], banned_categories: [], conditions: [], notes: null };
const all = starterChoices([], rules);
afterEach(cleanup);

describe("FoodsPickHint", () => {
  it("counts picks per group and says what is left", () => {
    render(<FoodsPickHint choices={all} marks={{}} />);
    expect(screen.getByRole("status").textContent).toBe("Pick 2 proteins, 2 carbs, 2 fats to finish.");
    expect(screen.getByLabelText("Picks so far").textContent).toBe("Proteins 0/2 · Carbs 0/2 · Fats 0/2");
  });

  it("says when the picks are enough", () => {
    const pick = (role: string) => all.filter((item) => item.role === role).slice(0, 2);
    const marks = Object.fromEntries([...pick("protein"), ...pick("carb"), ...pick("fat")]
      .map((item) => [item.id, "eats" as const]));
    render(<FoodsPickHint choices={all} marks={marks} />);
    expect(screen.getByRole("status").textContent).toMatch(/That's enough/);
  });

  it("explains a group the rules leave short instead of asking for more", () => {
    const fats = all.filter((item) => item.role !== "fat");
    const oneProtein = [...fats.filter((item) => item.role !== "protein"),
      ...fats.filter((item) => item.role === "protein").slice(0, 1)];
    render(<FoodsPickHint choices={oneProtein} marks={{}} />);
    const text = screen.getByTestId("foods-pick-hint").textContent ?? "";
    expect(text).toMatch(/leave only 1 protein, so that's all you need/);
    expect(text).toMatch(/leave no fats, so we'll skip them/);
    expect(screen.getByRole("status").textContent).toBe("Pick 1 protein, 2 carbs to finish.");
    expect(STARTERS.length).toBeGreaterThan(0);
  });

  it("lets a person with no allowed foods finish", () => {
    render(<FoodsPickHint choices={[]} marks={{}} />);
    expect(screen.getByRole("status").textContent).toMatch(/you can finish and add foods later/);
  });
});
