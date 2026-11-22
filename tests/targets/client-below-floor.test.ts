import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultStore, __resetStoreCache, loadStore, saveStore } from "@/lib/store";
import { resetTestAccount } from "@/tests/helpers/account";
import type { AccountHandle } from "@/lib/device/account";

/**
 * W060, docs/specs/phase-12-coach-tools.md 1.5: a `422 below_floor` answer is typed
 * (`TargetFloorError`), carries the server's sentence, is never queued, and a queued save the
 * server refuses this way is dropped by the drain instead of retrying forever.
 */
let h: AccountHandle;
const USER_ID = "00000000-0000-4000-8000-000000000011";
const SENTENCE = "That is below your minimum of 1900 kcal a day. Choose 1900 or more.";

const {
  drainPendingTargetRevisions, persistDerivedTargetRevisionSet, readPendingTargetRevisions,
  TargetFloorError, TargetMacroError, TargetSaveRefusedError, TargetRevisionQueuedError,
} = await import("@/lib/targets/client");
const { postTargets } = await import("@/lib/estimator-client");
const { refusalMessage } = await import("@/lib/targets/refusal");

const floorBody = {
  error: "below_floor", message: SENTENCE, floor: "kcal", dayType: "rest", minimum: 1900,
};
const refuse = (body: unknown = floorBody) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status: 422 }));

function stubLocalStorage(): void {
  const cells = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => cells.get(key) ?? null,
    setItem: (key: string, value: string) => { cells.set(key, value); },
    removeItem: (key: string) => { cells.delete(key); },
  });
}

const input = () => ({
  settings: loadStore().settings, latestWeighInKg: 60, today: "2026-09-19",
  trainingWeekdays: [1, 3, 4, 5], source: "derived" as const,
});

beforeEach(async () => {
  h = await resetTestAccount(USER_ID);
  globalThis.indexedDB = new IDBFactory();
  stubLocalStorage();
  __resetStoreCache();
  saveStore({ ...defaultStore(), settings: { ...defaultStore().settings,
    sex: "female", birthYear: 1996, heightCm: 165, weightKg: 60,
    activityLevel: "moderate", goal: "recomp", trainingWeekdays: [1, 3, 4, 5],
  } }, { silent: true });
});

describe("a below_floor answer to a target save", () => {
  it("throws TargetFloorError with the floor, the day and the server's sentence", async () => {
    const error = await persistDerivedTargetRevisionSet(input(), { fetchImpl: refuse(), account: h })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TargetFloorError);
    expect(error).toBeInstanceOf(TargetSaveRefusedError); // existing readers still match
    expect(error).toMatchObject({ status: 422, code: "below_floor", floor: "kcal",
      dayType: "rest", minimum: 1900, message: SENTENCE });
  });

  it("is not queued, even for a caller that queues failures, and the queue stays empty", async () => {
    const error = await persistDerivedTargetRevisionSet(input(),
      { fetchImpl: refuse(), account: h, queueOnFailure: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TargetFloorError);
    expect(error).not.toBeInstanceOf(TargetRevisionQueuedError);
    expect(await readPendingTargetRevisions(h)).toEqual([]);
  });

  it("still queues a 503 (the contrast: only a final refusal is dropped)", async () => {
    await expect(persistDerivedTargetRevisionSet(input(), { account: h, queueOnFailure: true,
      fetchImpl: vi.fn(async () => new Response(null, { status: 503 })) }))
      .rejects.toBeInstanceOf(TargetRevisionQueuedError);
    expect(await readPendingTargetRevisions(h)).toHaveLength(1);
  });

  it("a kcal_mismatch or invalid_macros answer keeps the server's sentence and is never queued", async () => {
    const sentence = "Your calories and macros don't add up: they make 2120 kcal. Change one of them.";
    for (const error of ["kcal_mismatch", "invalid_macros"]) {
      const caught = await persistDerivedTargetRevisionSet(input(),
        { fetchImpl: refuse({ error, message: sentence }), account: h, queueOnFailure: true })
        .catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(TargetMacroError);
      expect(caught).toMatchObject({ status: 422, code: error, message: sentence });
      expect(refusalMessage(caught, "fallback")).toBe(sentence);
      expect(await readPendingTargetRevisions(h)).toEqual([]);
    }
    // A queued save refused this way is dropped by the drain, not retried forever.
    await expect(persistDerivedTargetRevisionSet(input(), { account: h, queueOnFailure: true,
      fetchImpl: vi.fn(async () => new Response(null, { status: 503 })) }))
      .rejects.toBeInstanceOf(TargetRevisionQueuedError);
    await expect(drainPendingTargetRevisions(h, {
      fetchImpl: refuse({ error: "kcal_mismatch", message: sentence }) }))
      .resolves.toEqual({ posted: 0, pending: 0 });
  });

  it("falls back to a plain refusal when the body cannot be read as a floor", async () => {
    for (const body of [{ error: "below_floor" }, { error: "below_floor", message: SENTENCE,
      floor: "carbs", dayType: "rest", minimum: 1 }, "nope"]) {
      const error = await persistDerivedTargetRevisionSet(input(),
        { fetchImpl: refuse(body), account: h }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TargetSaveRefusedError);
      expect(error).not.toBeInstanceOf(TargetFloorError);
      expect((error as Error).message).toBe("save targets failed: 422");
    }
  });

  it("drops a queued save the server now refuses, and keeps one it only could not reach", async () => {
    await expect(persistDerivedTargetRevisionSet(input(), { account: h, queueOnFailure: true,
      fetchImpl: vi.fn(async () => new Response(null, { status: 503 })) }))
      .rejects.toBeInstanceOf(TargetRevisionQueuedError);
    const offline = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    await expect(drainPendingTargetRevisions(h, { fetchImpl: offline }))
      .resolves.toEqual({ posted: 0, pending: 1 });

    const refused = refuse();
    await expect(drainPendingTargetRevisions(h, { fetchImpl: refused }))
      .resolves.toEqual({ posted: 0, pending: 0 });
    expect(refused).toHaveBeenCalledTimes(1);
    expect(await readPendingTargetRevisions(h)).toEqual([]);
    // Nothing is left to retry: a later pass sends nothing.
    const later = refuse();
    await drainPendingTargetRevisions(h, { fetchImpl: later });
    expect(later).not.toHaveBeenCalled();
    expect(loadStore().settings.activeTargetProfile ?? null).toBeNull();
  });
});

describe("Settings' grams and percent save", () => {
  it("throws the same typed refusal, so the sheet can show the sentence", async () => {
    const error = await postTargets({ mode: "grams", effectiveFrom: "2026-09-19", kcalTrain: 1500,
      kcalRest: 1500, grams: { proteinG: 100, fatG: 50, carbG: 150 } }, refuse())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TargetFloorError);
    expect(refusalMessage(error, "Couldn't save")).toBe(SENTENCE);
  });

  it("keeps the generic error for a 5xx and for any other refusal", async () => {
    const req = { mode: "percent" as const, effectiveFrom: "2026-09-19", kcalTrain: 2000,
      kcalRest: 2000, percent: { proteinPct: 30, fatPct: 30, carbPct: 40 } };
    await expect(postTargets(req, vi.fn(async () => new Response(null, { status: 500 }))))
      .rejects.toThrow("save targets failed: 500");
    const other = await postTargets(req, refuse({ error: "adult_only" })).catch((e: unknown) => e);
    expect(other).toBeInstanceOf(TargetSaveRefusedError);
    expect(other).not.toBeInstanceOf(TargetFloorError);
    expect(refusalMessage(other, "Couldn't save")).toBe("Couldn't save");
  });
});
