// @vitest-environment jsdom
/**
 * Tester readiness A3: an account outside the recipe and Shopping pilot (RECIPE_PLANNING_USER_IDS)
 * sees a calm "coming soon" state on every recipe or Shopping surface it can reach, never an
 * error-toned notice or "not available" / "unavailable" copy.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/FavoritesStrip", () => ({ default: () => null }));
vi.mock("@/components/CatalogFavorites", () => ({ default: () => null }));
vi.mock("@/components/RecipeDiscovery", () => ({ default: () => null }));
vi.mock("@/components/MyFoods", () => ({ default: () => null }));
vi.mock("@/lib/recipe-access-client", async (original) => ({
  ...(await original<typeof import("@/lib/recipe-access-client")>()),
  useRecipeAccess: () => ({ enabled: false, loading: false, unavailable: false, retry: () => undefined }),
}));

import EatsView from "@/components/EatsView";
import RecipeResultsBlock from "@/components/coach/blocks/recipe_results";
import { SHOPPING_UNAVAILABLE_REASON } from "@/lib/coach/apply-shopping";
import { SHOPPING_FOCUS_UNAVAILABLE_REASON } from "@/lib/coach/apply-shopping-focus";
import { RECIPES_AND_SHOPPING_COMING_SOON, RECIPES_COMING_SOON, SHOPPING_COMING_SOON }
  from "@/lib/recipe-pilot-copy";

const RAW = /not available|unavailable|isn[’']t on/i;

afterEach(() => { cleanup(); });

describe("a non-pilot account", () => {
  it("sees a neutral coming-soon line inside the Recipes card on Foods", () => {
    render(<EatsView recipeAccess={{ enabled: false, loading: false, unavailable: false }} />);
    fireEvent.click(screen.getByRole("button", { name: /^Recipes/ }));
    const line = screen.getByText(RECIPES_AND_SHOPPING_COMING_SOON);
    expect(line.closest("[data-tone]")?.getAttribute("data-tone")).toBe("neutral");
    expect(document.body.textContent).not.toMatch(RAW);
  });

  it("sees coming soon, not an error, on a coach recipe_results block", () => {
    render(<RecipeResultsBlock blockId="b1" recipes={[]} />);
    expect(screen.getByRole("status").textContent).toBe(RECIPES_COMING_SOON);
  });

  it("gets coming-soon copy when the coach tries a Shopping action", () => {
    expect(SHOPPING_UNAVAILABLE_REASON).toBe(SHOPPING_COMING_SOON);
    expect(SHOPPING_FOCUS_UNAVAILABLE_REASON).toBe(SHOPPING_COMING_SOON);
    for (const copy of [RECIPES_COMING_SOON, RECIPES_AND_SHOPPING_COMING_SOON, SHOPPING_COMING_SOON]) {
      expect(copy).toMatch(/coming soon/);
      expect(copy).not.toMatch(RAW);
    }
  });
});
