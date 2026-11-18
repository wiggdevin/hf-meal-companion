import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutorPorts, SuggestInput } from "@/lib/coach/executors";
import { recipeSearchFromWish } from "@/lib/coach/recipe-query";
import { recipeAccessEnabled } from "@/lib/server/recipe-access";
import { RECIPES_COMING_SOON } from "@/lib/recipe-pilot-copy";

/** Shared discovery stays gated; a no-cook wish may use the existing checked meal engine. */
export async function coachRecipeSuggestions(client: SupabaseClient, userId: string,
  args: SuggestInput, now: string | undefined, meals: ExecutorPorts["suggest"]) {
  const { search, unsupportedExclusion } = recipeSearchFromWish(args.wish ?? "", args.count ?? 3);
  if (unsupportedExclusion) return { candidates: [], noResultReasons: [
    "This search cannot check a one-off ingredient exclusion. Add the ingredient to Avoids, then search again.",
  ] };
  if (!recipeAccessEnabled(userId)) {
    const unavailable = RECIPES_COMING_SOON;
    if (search.effort === "none") {
      const result = await meals(userId, { ...args, kind: "meal", count: Math.min(3, args.count ?? 3) });
      if (Array.isArray(result) && result.length) return result;
      const reason = Array.isArray(result) ? (result as typeof result & { message?: string }).message : null;
      return { candidates: [], noResultReasons: [[unavailable, reason].filter(Boolean).join(" ")] };
    }
    return { candidates: [], noResultReasons: [unavailable] };
  }
  const { loadRecipeCandidates } = await import("@/lib/server/recipe-candidates");
  const result = await loadRecipeCandidates(client, userId, search, now ? new Date(now) : new Date());
  return { candidates: result.candidates, noResultReasons: result.noResultReasons, exactMatch: result.exactMatch };
}
