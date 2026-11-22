/**
 * Fast logging (2026-11-21): proposeDraft's pre-model reads run together, not one after another.
 *
 * The duplicate probe, the spend-cap read and the food-rules read do not depend on each other, so
 * they overlap. What must NOT change: the cap is decided before the model is called, a duplicate
 * answers 409 before the cap writes its `blocked` row, and a blocked cap never reaches the model.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateRequest, proposeDraft } from "@/lib/server/capture";

const REQ = { method: "text" as const, localDate: "2026-09-17", tz: "America/New_York",
  slot: "meal-1", text: "an egg" };

const tick = () => new Promise((r) => setTimeout(r, 2));

type Opts = { duplicate?: boolean; used?: number };

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
    if (name === "ai_calls_today") return timed("caps", { data: opts.used ?? 0, error: null });
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
      if (table === "constraint_profiles") return timed("profile", { data: null, error: null });
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

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CAPTURE_METHODS", "text,voice,label,photo");
});

describe("proposeDraft's pre-model reads", () => {
  it("runs the duplicate probe, the cap read and the food-rules read at the same time", async () => {
    const log: string[] = [];
    const db = fakeDb(log);
    await proposeDraft(db.client, db.client, "u1", REQ, deps(log));
    // Each of the three starts before any of the others has finished.
    const firstEnd = Math.min(at(log, "duplicate:end"), at(log, "caps:end"), at(log, "profile:end"));
    expect(at(log, "duplicate:start")).toBeLessThan(firstEnd);
    expect(at(log, "caps:start")).toBeLessThan(firstEnd);
    expect(at(log, "profile:start")).toBeLessThan(firstEnd);
  });

  it("still decides the cap and the duplicate before the model is called", async () => {
    const log: string[] = [];
    const db = fakeDb(log);
    await proposeDraft(db.client, db.client, "u1", REQ, deps(log));
    expect(at(log, "caps:end")).toBeLessThan(at(log, "model:start"));
    expect(at(log, "duplicate:end")).toBeLessThan(at(log, "model:start"));
  });

  it("never calls the model at the hard cap", async () => {
    vi.stubEnv("CAPTURE_HARD_CAP", "5");
    const log: string[] = [];
    const db = fakeDb(log, { used: 999 });
    const d = deps(log);
    await expect(proposeDraft(db.client, db.client, "u1", REQ, d)).rejects.toMatchObject({ code: "spend_cap" });
    expect(d.runCapture).not.toHaveBeenCalled();
  });

  it("answers a duplicate first, without writing a blocked row, even at the hard cap", async () => {
    vi.stubEnv("CAPTURE_HARD_CAP", "5");
    const log: string[] = [];
    const db = fakeDb(log, { duplicate: true, used: 999 });
    const d = deps(log);
    await expect(proposeDraft(db.client, db.client, "u1", REQ, d)).rejects.toBeInstanceOf(DuplicateRequest);
    expect(db.inserts).toEqual([]);
    expect(d.runCapture).not.toHaveBeenCalled();
  });

  it("does not leave a failed early rules read unhandled when the cap refuses first", async () => {
    vi.stubEnv("CAPTURE_HARD_CAP", "5");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const log: string[] = [];
      const db = fakeDb(log, { used: 999 });
      const client = db.client as unknown as { from: (t: string) => Record<string, unknown> };
      const realFrom = client.from;
      client.from = (table: string) => {
        const chain = realFrom(table);
        if (table === "constraint_profiles") {
          chain.maybeSingle = async () => ({ data: null, error: { message: "boom" } });
        }
        return chain;
      };
      await expect(proposeDraft(db.client, db.client, "u1", REQ, deps(log))).rejects.toMatchObject({ code: "spend_cap" });
      await tick(); await tick();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
