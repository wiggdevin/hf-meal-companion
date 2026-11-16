import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runModelLoop } from "@/lib/server/coach-turn/model-loop";
import { newModelState } from "@/lib/server/coach-turn/model-state";
import { EMPTY_PROFILE } from "@/lib/policy/constraints";

describe("coach cancellation at the model boundary", () => {
  it.each([true, false])("starts no further model call after cancellation (already aborted: %s)", async (before) => {
    const controller = new AbortController();
    if (before) controller.abort();
    const step = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new Error("503 model overloaded");
    });
    const now = Date.now();
    await expect(runModelLoop({ now: () => 0, realStartedAt: now, req: { text: "suggest lunch" }, deps: {} } as never,
      { startedAt: 0, profile: EMPTY_PROFILE, foodEvidence: {}, turnAbort: controller,
        wallClockBudgetMs: 30_000 } as never, {} as never, newModelState([], 0),
      { step, responseSchema: z.unknown() } as never)).rejects.toMatchObject({ code: "coach_unavailable" });
    expect(step).toHaveBeenCalledTimes(before ? 0 : 1);
  });
});
