/** @vitest-environment jsdom */
/** Fast logging: a /log request held across onboarding is taken once, and never when stale. */
import { beforeEach, describe, expect, it } from "vitest";
import { holdLogIntent, takeHeldLogIntent } from "@/lib/log/held-log-intent";

beforeEach(() => window.sessionStorage.clear());

describe("the held /log request", () => {
  it("is taken once", () => {
    holdLogIntent({ mode: "voice", slot: "meal-2" }, 1_000);
    expect(takeHeldLogIntent(2_000)).toEqual({ mode: "voice", slot: "meal-2" });
    expect(takeHeldLogIntent(2_000)).toBeNull();
  });

  it("expires after half an hour", () => {
    holdLogIntent({ mode: "voice", slot: null }, 0);
    expect(takeHeldLogIntent(30 * 60_000 + 1)).toBeNull();
  });

  it("drops values it does not know", () => {
    window.sessionStorage.setItem("smc:device:log-intent", JSON.stringify({ mode: "fax", slot: "x", at: 0 }));
    expect(takeHeldLogIntent(1)).toEqual({ mode: null, slot: null });
    window.sessionStorage.setItem("smc:device:log-intent", "{not json");
    expect(takeHeldLogIntent(1)).toBeNull();
  });
});
