// @vitest-environment jsdom
/**
 * W060 (docs/specs/phase-12-coach-tools.md 1.5): Settings shows the server's own sentence when a
 * pin, a grams or percent save, or a reset is refused below a floor, and keeps the generic line
 * for every other failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { defaultSettings } from "@/lib/store";
import type { Store } from "@/lib/types";
import { TargetFloorError } from "@/lib/targets/refusal";

const SENTENCE = "That is less than your minimum of 140 g of protein a day. Choose 140 g or more.";
const GENERIC = "Couldn't save your targets — try again when you have a connection.";

const next = vi.hoisted(() => ({ failure: null as unknown }));
const store = vi.hoisted(() => ({ value: null as unknown as Store }));
vi.mock("@/lib/store", async (original) => ({
  ...(await original<typeof import("@/lib/store")>()),
  loadStore: () => store.value,
  saveStore: (value: Store) => { store.value = value; },
  saveStoreFor: (_h: unknown, value: Store) => { store.value = value; },
}));
vi.mock("@/lib/coach/apply-profile", () => ({
  applySetTargets: async () => { throw next.failure; },
  applyUpdateProfile: async () => ({ status: "applied" }),
  syncProfileSettings: async () => {},
}));
vi.mock("@/lib/health-client", () => ({ fetchDaily: async () => ({ days: [] }) }));
vi.mock("@/lib/targets/client", () => ({ fetchTargetState: async () => ({ target: null }) }));
vi.mock("@/lib/estimator-client", async (original) => ({
  ...(await original<typeof import("@/lib/estimator-client")>()),
  postTargets: async () => { throw next.failure; },
}));
vi.mock("@/lib/device/account", async (original) => ({
  ...(await original<typeof import("@/lib/device/account")>()),
  currentAccountOrNull: () => null,
}));
vi.mock("@/lib/profile/cuisines-client", () => ({ savePlaceSetting: async () => {} }));
vi.mock("@/lib/profile/taste-enabled-client", () => ({ readTasteChipsEnabled: async () => "disabled" }));

afterEach(() => { cleanup(); next.failure = null; });

async function controller() {
  store.value = { settings: { ...defaultSettings(), proteinG: 140 } } as unknown as Store;
  const { useSettingsController } = await import("@/components/settings/use-settings-controller");
  const { result } = renderHook(() => useSettingsController());
  await waitFor(() => expect(result.current).not.toBeNull());
  return result;
}

const floor = () => new TargetFloorError("protein", "training", 140, SENTENCE);
const request = { mode: "grams" as const, effectiveFrom: "2026-09-19", kcalTrain: 1500,
  kcalRest: 1500, grams: { proteinG: 60, fatG: 50, carbG: 200 } };

describe("Settings target refusals", () => {
  it("shows the sentence for a refused stepper pin", async () => {
    const result = await controller();
    next.failure = floor();
    act(() => { result.current!.setProteinG(60); });
    await waitFor(() => expect(result.current!.saveError).toBe(SENTENCE));
  });

  it("shows the sentence for a refused grams or percent save, and frees the button", async () => {
    const result = await controller();
    next.failure = floor();
    act(() => { result.current!.saveTargets(request); });
    await waitFor(() => expect(result.current!.saveError).toBe(SENTENCE));
    expect(result.current!.targetSaving).toBe(false);
  });

  it("shows the sentence for a refused reset", async () => {
    const result = await controller();
    next.failure = floor();
    act(() => { result.current!.resetTargets(); });
    await waitFor(() => expect(result.current!.saveError).toBe(SENTENCE));
  });

  it("keeps the connection line for any other failure", async () => {
    const result = await controller();
    next.failure = new TypeError("network lost");
    act(() => { result.current!.saveTargets(request); });
    await waitFor(() => expect(result.current!.saveError).toBe(GENERIC));
    next.failure = new Error("save targets failed: 500");
    act(() => { result.current!.setProteinG(150); });
    await waitFor(() => expect(result.current!.saveError).toBe(GENERIC));
  });
});
