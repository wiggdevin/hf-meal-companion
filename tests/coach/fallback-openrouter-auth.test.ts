/**
 * Weak-spot audit 2026-11-17 item 2: an OpenRouter-primary coach turn whose key, credit or route
 * fails (401, 402, 403, 404) moves to the Gemini pin once, as capture already does
 * (lib/ai/capture.ts worthGemini). 429 and 5xx keep their capacity path; a 400, a 500 and the
 * spend cap's HttpError keep theirs.
 */
import { withCoachSaveTurn } from "@/tests/helpers/coach-save-turn";
import { afterEach, describe, expect, it, vi } from "vitest";
const pins = vi.hoisted(() => ({ same: false }));

vi.mock("@/lib/ai/lanes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/lanes")>();
  return { ...actual, OPENROUTER_PINS: { ...actual.OPENROUTER_PINS,
    coach: "openai/gpt-5-mini", get coachFallback() {
      return pins.same ? "openai/gpt-5-mini" : "anthropic/claude-haiku";
    } } };
});

// Each case resets the module registry and re-imports the coach graph (~1.2 s alone); under the
// full suite's load that passed 5 s. A slow import is not a failure (2026-10-02).
vi.setConfig({ testTimeout: 20_000 });

const OPENROUTER_MODEL = "openai/gpt-5-mini";
const OPENROUTER_FALLBACK_MODEL = "anthropic/claude-haiku";

function db(writes: { rows: { table: string; row: unknown }[] }) {
  const api = (table: string) => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain, eq: () => chain, in: () => chain, is: () => chain, gte: () => chain,
      order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
      insert: (row: unknown) => { writes.rows.push({ table, row }); return chain; },
      update: (row: unknown) => { writes.rows.push({ table, row }); return chain; },
    });
    return chain;
  };
  return withCoachSaveTurn({ from: (t: string) => api(t), rpc: async () => ({ data: [], error: null }) }) as never;
}

const ports = {
  dayTotals: async () => ({ local_date: "2026-09-16", nutrients: [] }),
  weekTotals: async () => [],
  activeTargets: async () => ({ kcal_train: 2200 }),
  latestEstimate: async () => ({ status: "burn_in" }),
  searchFoods: async () => [],
  getConstraints: async () => ({ avoid_allergens: [] }),
  recentGut: async () => [],
  dayPlan: async () => ({ slots: [] }),
  dayEntries: async () => [],
  compose: async () => ({ wish: "", slot: null, items: [],
    totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    target: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, flagged: [], fitsTarget: false }),
  newDraftId: () => "draft-1",
};

const noClassify = () => vi.fn().mockResolvedValue(null) as never;
const REQ = { threadId: null, messageId: "3f1b1a2c-0000-4000-8000-000000000090",
  text: "what should I eat", now: "2026-09-16T15:00:00.000Z", tz: "America/Denver" };


function readyEnv(): void {
  vi.stubEnv("COACH_ENABLED", "1");
  vi.stubEnv("TYPESAFE_API_KEY", "");
  vi.stubEnv("HEALTH_CONTEXT_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_BILLING_ATTESTED", "1");
  vi.stubEnv("COACH_PROVIDER", "openrouter");
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
  vi.stubEnv("OPENROUTER_ATTESTED", "1");
}


type Writes = { rows: { table: string; row: unknown }[] };

type Errors = { ProviderHttpError: typeof import("@/lib/ai/call").ProviderHttpError;
  HttpError: typeof import("@/lib/server/auth").HttpError };

// The error classes come from the same module registry the turn uses, so `instanceof` holds.
async function turnWith(failure: (e: Errors) => unknown, opts: { geminiAttested?: boolean } = {}) {
  readyEnv();
  if (opts.geminiAttested === false) vi.stubEnv("GEMINI_BILLING_ATTESTED", "");
  vi.resetModules();
  const { runTurn } = await import("@/lib/server/coach-turn");
  const { GEMINI_COACH } = await import("@/lib/ai/models");
  const errors: Errors = { ProviderHttpError: (await import("@/lib/ai/call")).ProviderHttpError,
    HttpError: (await import("@/lib/server/auth")).HttpError };
  const writes: Writes = { rows: [] };
  const openRouterCalls: string[] = [];
  const generateOpenRouter = vi.fn(async (args: { modelId: string }) => {
    openRouterCalls.push(args.modelId);
    throw failure(errors);
  });
  const generate = vi.fn(async () => ({ kind: "final", text: "Gemini answered." }));
  const run = runTurn(db(writes), db(writes), "u1", REQ, {
    generate: generate as never, generateOpenRouter: generateOpenRouter as never, ports,
    classifyIntent: noClassify(), newId: () => "3f1b1a2c-0000-4000-8000-0000000000d1",
  });
  return { run, generate, openRouterCalls, GEMINI_COACH };
}

describe("the coach falls back to Gemini when OpenRouter fails on key, credit or route", () => {
  afterEach(() => { pins.same = false; vi.unstubAllEnvs(); vi.resetModules(); });

  it.each([401, 402, 403, 404])("an OpenRouter %i goes straight to the Gemini pin", async (status) => {
    const t = await turnWith((e) => new e.ProviderHttpError(status, `openrouter ${status}`));
    const res = await t.run;
    // The same key (and the same account's credit) fails every OpenRouter model alike.
    expect(t.openRouterCalls).toEqual([OPENROUTER_MODEL]);
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(res.model).toMatchObject({ provider: "gemini", modelId: t.GEMINI_COACH,
      fellBackBecause: "failed" });
  });

  it("does not reach an unattested Gemini on a 401", async () => {
    const t = await turnWith((e) => new e.ProviderHttpError(401, "openrouter 401"), { geminiAttested: false });
    await expect(t.run).rejects.toMatchObject({ status: 503, code: "coach_unavailable" });
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("a 429 keeps its capacity path to Gemini", async () => {
    const t = await turnWith((e) => new e.ProviderHttpError(429, "openrouter 429"));
    const res = await t.run;
    expect(t.openRouterCalls).toEqual([OPENROUTER_MODEL]);
    expect(res.model).toMatchObject({ provider: "gemini", fellBackBecause: "capacity" });
  });

  it("a 503 still tries the same-key OpenRouter model before Gemini", async () => {
    const t = await turnWith((e) => new e.ProviderHttpError(503, "openrouter 503"));
    const res = await t.run;
    expect(t.openRouterCalls).toEqual([OPENROUTER_MODEL, OPENROUTER_FALLBACK_MODEL]);
    expect(res.model).toMatchObject({ provider: "gemini", fellBackBecause: "capacity" });
  });

  it.each([400, 500])("an OpenRouter %i still ends the turn as coach_unavailable", async (status) => {
    const t = await turnWith((e) => new e.ProviderHttpError(status, `openrouter ${status}`));
    await expect(t.run).rejects.toMatchObject({ status: 503, code: "coach_unavailable" });
    expect(t.generate).not.toHaveBeenCalled();
  });

  it("the spend cap's 429 HttpError is never retried on Gemini", async () => {
    const t = await turnWith((e) => new e.HttpError(429, "spend_cap", "daily AI spend cap reached"));
    await expect(t.run).rejects.toMatchObject({ status: 429 });
    expect(t.generate).not.toHaveBeenCalled();
  });
});
