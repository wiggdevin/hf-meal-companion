/**
 * What the fast path and the model loop share, built once the health gate has passed: the
 * executor and reply-check ports over the profile the gate read, the abort that stops late
 * lookups writing, and the loop's wall-clock budget.
 */

import { recordFoodHits } from "@/lib/server/coach-turn/food-evidence";
import type { EvidenceByName } from "@/lib/coach/policy";
import { makeExecutors } from "@/lib/coach/executors";
import { TURN_LIMITS } from "@/lib/coach/turn";
import { defaultPorts } from "@/lib/server/coach-ports";
import { liveLogEntryExists } from "@/lib/server/coach-unlogged-meal";
import { pinPlanSlot, planSlotOf } from "@/lib/server/coach-turn/plan-slot";
import type { ReplyCheckPorts } from "@/lib/server/reply-check";
import { replyCheckPorts } from "@/lib/server/reply-check-ports";
import type { PolicyProfileRead } from "@/lib/server/coach-turn/setup";
import type { OpenTurn } from "@/lib/server/coach-turn/types";

export type TurnKit = ReturnType<typeof armTurn>;

export function armTurn(turn: OpenTurn, gate: PolicyProfileRead) {
  const { client, admin, deps, now, newId, clock } = turn;
  const { profile, instances: profileInstances } = gate;
  // Aborted once the turn stops waiting for its lookups, so they write nothing late (review r2).
  const turnAbort = new AbortController();
  const foodEvidence: EvidenceByName = {};
  const onFoodHits = (userId: string, hits: Parameters<typeof recordFoodHits>[1]) => {
    if (userId === turn.userId && !turnAbort.signal.aborted) recordFoodHits(foodEvidence, hits);
  };
  const turnPorts = {
    ...defaultPorts(client, admin, newId, clock, { signal: turnAbort.signal, profile, onFoodHits }),
    ...deps.ports,
  };
  // Injected search ports follow the same completed-result evidence boundary.
  const searchFoods = turnPorts.searchFoods;
  turnPorts.searchFoods = async (...args) => {
    const hits = await searchFoods(...args);
    onFoodHits(args[0], hits);
    return hits;
  };
  // A Plan-sheet turn always plans one known meal slot, on the fast path and the model path alike.
  const executors = pinPlanSlot(makeExecutors(turnPorts), planSlotOf(turn.req));
  // Passive safety lookups never supply the active tool/grounding identity ledger.
  const passiveSearch = deps.ports?.searchFoods ?? defaultPorts(client, admin, newId, clock,
    { signal: turnAbort.signal, profile }).searchFoods;
  const replyPorts: ReplyCheckPorts = {
    ...replyCheckPorts(passiveSearch, profileInstances),
    hasAvoidFoods: async (userId) => {
      const query = client.from("user_food_prefs").select("food_ref_id")
        .eq("user_id", userId).eq("status", "avoid").limit(1);
      const { data, error } = await (typeof query.abortSignal === "function"
        ? query.abortSignal(turnAbort.signal) : query);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    ...deps.replyCheck,
  };
  const startedAt = now();
  const wallClockBudgetMs = deps.wallClockMs ?? TURN_LIMITS.wallClockMs;
  return { profile, profileInstances, foodEvidence, turnAbort, turnPorts, executors, replyPorts,
    logEntryExists: deps.logEntryExists ?? liveLogEntryExists, startedAt,
    wallClockBudgetMs };
}
