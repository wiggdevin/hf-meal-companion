/** Actual completed server lookups only; model-provided identities never enter this ledger. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { eatsOwnFood } from "@/lib/server/eats-own-food";
import type { FoodHit } from "@/lib/coach/executors";
import { allergenFacts, type EvidenceByName } from "@/lib/coach/policy";
import { recordFoodEvidence } from "@/lib/coach/food-evidence";

export function recordFoodHits(evidence: EvidenceByName, hits: readonly FoodHit[]): void {
  for (const hit of hits) {
    if (!hit.foodRefId) continue;
    recordFoodEvidence(evidence, hit.name, {
      foodRefId: hit.foodRefId, catalogFoodRevisionId: hit.catalogFoodRevisionId ?? null,
      allergenTags: hit.allergenTags ?? null, ...allergenFacts(hit), category: hit.category ?? null,
      onEatsList: hit.prefStatus === "eats", onAvoidList: hit.prefStatus === "avoid",
    });
  }
}

/** A completed lookup publishes only while its turn is still waiting for results. */
export type FoodLookupObserver = {
  signal?: AbortSignal;
  onFoodHits?: (userId: string, hits: readonly FoodHit[]) => void;
};

/** The Eats fast lookup bypasses catalog search, but must preserve the same real-hit ledger. */
export function observedOwnFood(
  client: SupabaseClient,
  exactUserFood: Parameters<typeof eatsOwnFood>[1],
  observer: FoodLookupObserver,
): ReturnType<typeof eatsOwnFood> {
  const ownFood = eatsOwnFood(client, exactUserFood);
  return async (userId, name, signal) => {
    const hit = await ownFood(userId, name, signal);
    signal?.throwIfAborted();
    observer.signal?.throwIfAborted();
    if (hit) observer.onFoodHits?.(userId, [hit]);
    return hit;
  };
}
