/**
 * Fast logging: proposeDraft's duplicate probe and cap read run together, not one after another.
 *
 * What must NOT change: a duplicate answers 409 before the cap writes its `blocked` row (and without
 * waiting on the cap read), the cap is decided before the model is called, a blocked cap never
 * reaches the model, and the food rules are read only after the caps pass and before the paid call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateRequest, proposeDraft } from "@/lib/server/capture";

const REQ = { method: "text" as const, localDate: "2026-09-17", tz: "America/Denver",
  slot: "meal-1", text: "an egg" };

const tick = () => new Promise((r) => setTimeout(r, 2));
const never = () => new Promise<never>(() => {});

type Opts = {
  duplicate?: boolean; used?: number;
  stallCaps?: boolean; failCaps?: boolean; failProfile?: boolean;
};

/** A fake client that records when each pre-model read starts and ends. */
function fakeDb(log: string[], opts: Opts = {}) {
  const inserts: unknown[] = [];
  const timed = async <T>(name: string, value: T): Promise<T> => {
    log.push(`${name}:start`);
    await tick();
    log.push(`${name}:end`);
    return value;
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === "ai_calls_today") {
      if (opts.stallCaps) { log.push("caps:start"); return never(); }
      if (opts.failCaps) {
        log.push("caps:start"); await tick();
        return { data: null, error: { message: "cap read down" } };
      }
      return timed("caps", { data: opts.used ?? 0, error: null });
    }
    if (name === "get_or_create_food_ref") return { data: "ref-70", error: null };
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "gte", "order", "limit", "in", "range", "eq"]) chain[m] = vi.fn(self);
    chain.maybeSingle = vi.fn(async () => {
      if (table === "ai_calls") {
        return timed("duplicate", { data: opts.duplicate ? { id: "call-1" } : null, error: null });
      }
      if (table === "constraint_profiles") {
        return timed("profile", opts.failProfile
          ? { data: null, error: { message: "rules down" } } : { data: null, error: null });
      }
      return { data: null, error: null };
    });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
    chain.insert = vi.fn(async (row: unknown) => { inserts.push({ table, row }); return { error: null }; });
    return chain;
  });
  return { client: { rpc, from } as never, inserts };
}

function deps(log: string[]) {
  return {
    runCapture: vi.fn(async () => {
      log.push("model:start");
      await tick();
      log.push("model:end");
      return { items: [{ label: "egg", grams: 50, qty: 1, unit: "whole", confidence: 0.9 }], notes: [] };
    }) as never,
    searchFoods: vi.fn(async () => ({ hits: [], queryClass: "generic", autoResolve: null,
      catalogVersion: "v1" })) as never,
  };
}

const at = (log: string[], event: string) => log.indexOf(event);
const blockedRows = (inserts: unknown[]) => inserts.filter((i) => (i as { table: string }).table === "ai_calls");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CAPTURE_METHODS", "text,voice,label,photo");
  vi.stubEnv("CAPTURE_DAILY_SOFT_CAP", "3");
  vi.stubEnv("CAPTURE_DAILY_HARD_CAP", "5");
});

describe("proposeDraft's pre-model checks", () => {
  it("runs the duplicate probe and the cap read at the same time", async () => {
    const log: string[] = [];
    const db = fakeDb(log);
    await proposeDraft(db.client, db.client, "u1", REQ, deps(log));
    const firstEnd = Math.min(at(log, "duplicate:end"), at(log, "caps:end"));
    expect(at(log, "duplicate:start")).toBeLessThan(firstEnd);
    expect(at(log, "caps:start")).toBeLessThan(firstEnd);
  });

  it("reads the food rules after the caps pass and before the model is called", async () => {
    const log: string[] = [];
    const db = fakeDb(log);
    await proposeDraft(db.client, db.client, "u1", REQ, deps(log));
    expect(at(log, "duplicate:end")).toBeLessThan(at(log, "profile:start"));
    expect(at(log, "caps:end")).toBeLessThan(at(log, "profile:start"));
    expect(at(log, "profile:end")).toBeLessThan(at(log, "model:start"));
  });

  it("stops on a failed food-rules read before the paid model call", async () => {
    const log: string[] = [];
    const db = fakeDb(log, { failProfile: true });
    const d = deps(log);
    await expect(proposeDraft(db.client, db.client, "u1", REQ, d)).rejects.toMatchObject({ code: "policy_failed" });
    expect(d.runCapture).not.toHaveBeenCalled();
  });

  it("answers a known duplicate without waiting on a stalled cap read", async () => {
    const log: string[] = [];
    const db = fakeDb(log, { duplicate: true, stallCaps: true });
    const d = deps(log);
    await expect(proposeDraft(db.client, db.client, "u1", REQ, d)).rejects.toBeInstanceOf(DuplicateRequest);
    expect(blockedRows(db.inserts)).toEqual([]);
    expect(d.runCapture).not.toHaveBeenCalled();
  });

  it("answers a duplicate first, without writing a blocked row, even at the hard cap", async () => {
    const log: string[] = [];
    const db = fakeDb(log, { duplicate: true, used: 999 });
    const d = deps(log);
    await expect(proposeDraft(db.client, db.client, "u1", REQ, d)).rejects.toBeInstanceOf(DuplicateRequest);
    expect(db.inserts).toEqual([]);
    expect(d.runCapture).not.toHaveBeenCalled();
  });

  it("handles a failed cap read at once and throws it only after the probe clears", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const log: string[] = [];
      const db = fakeDb(log, { failCaps: true });
      const d = deps(log);
      await expect(proposeDraft(db.client, db.client, "u1", REQ, d)).rejects.toMatchObject({ status: 503, code: "provider_unavailable" });
      await tick(); await tick();
      expect(unhandled).not.toHaveBeenCalled();
      expect(at(log, "duplicate:end")).toBeGreaterThan(-1);
      expect(d.runCapture).not.toHaveBeenCalled();
      expect(at(log, "profile:start")).toBe(-1);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("the real daily hard cap (CAPTURE_DAILY_HARD_CAP)", () => {
  it("lets the last slot under the cap through", async () => {
    const log: string[] = [];
    const db = fakeDb(log, { used: 4 });
    const d = deps(log);
    await proposeDraft(db.client, db.client, "u1", REQ, d);
    expect(d.runCapture).toHaveBeenCalledOnce();
  });

  it("refuses at the cap, writes one blocked row and never calls the model or reads the rules", async () => {
    const log: string[] = [];
    const db = fakeDb(log, { used: 5 });
    const d = deps(log);
    await expect(proposeDraft(db.client, db.client, "u1", REQ, d)).rejects.toMatchObject({ code: "spend_cap" });
    expect(blockedRows(db.inserts)).toHaveLength(1);
    expect(d.runCapture).not.toHaveBeenCalled();
    expect(at(log, "profile:start")).toBe(-1);
  });

  it("refuses every capture when the cap is 0 (the kill switch)", async () => {
    vi.stubEnv("CAPTURE_DAILY_HARD_CAP", "0");
    const log: string[] = [];
    const db = fakeDb(log, { used: 0 });
    const d = deps(log);
    await expect(proposeDraft(db.client, db.client, "u1", REQ, d)).rejects.toMatchObject({ code: "spend_cap" });
    expect(d.runCapture).not.toHaveBeenCalled();
  });
});
