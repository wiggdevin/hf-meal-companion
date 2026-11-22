/**
 * Fast logging (2026-11-21): a `/log` link opens the right capture straight away.
 *
 * `/log?mode=…&slot=…` (manifest shortcuts) redirects to Today as `/?log=…`. Today reads that, removes
 * it from the address bar, and opens the capture. A method that is switched off falls back to
 * something that is on, never to a dead sheet. Offline, Today's shell can be served at `/log` itself.
 */
import { describe, expect, it } from "vitest";
import {
  logRedirectPath, parseLogIntent, resolveLogIntent, slotOnDay, withoutLogIntent,
} from "@/lib/log/log-intent";

describe("logRedirectPath (the /log route)", () => {
  it("sends a known mode and slot to Today", () => {
    expect(logRedirectPath({ mode: "voice", slot: "meal-2" })).toBe("/?log=voice&slot=meal-2");
  });

  it("drops an unknown mode or slot instead of passing it on", () => {
    expect(logRedirectPath({ mode: "fax", slot: "lunch" })).toBe("/?log=open");
    expect(logRedirectPath({ mode: "photo", slot: "<script>" })).toBe("/?log=photo");
  });

  it("forwards no shared flag (there is no share target)", () => {
    expect(logRedirectPath({ mode: "photo", shared: "1" })).toBe("/?log=photo");
  });

  it("reads the first value of a repeated parameter", () => {
    expect(logRedirectPath({ mode: ["barcode", "text"] })).toBe("/?log=barcode");
  });
});

describe("parseLogIntent (Today)", () => {
  it("reads the mode and the slot", () => {
    expect(parseLogIntent("?log=photo&slot=meal-3")).toEqual({ mode: "photo", slot: "meal-3" });
  });

  it("is null when the address carries no log request", () => {
    expect(parseLogIntent("?d=2026-11-21")).toBeNull();
    expect(parseLogIntent("")).toBeNull();
  });

  it("opens the log sheet for an unknown or bare mode", () => {
    expect(parseLogIntent("?log=open")).toEqual({ mode: null, slot: null });
    expect(parseLogIntent("?log=nonsense&slot=nope")).toEqual({ mode: null, slot: null });
  });

  it("reads /log's own parameters when the shell is served at /log (offline)", () => {
    expect(parseLogIntent("?mode=voice&slot=meal-2", "/log")).toEqual({ mode: "voice", slot: "meal-2" });
    expect(parseLogIntent("", "/log")).toEqual({ mode: null, slot: null });
  });
});

describe("withoutLogIntent", () => {
  it("removes only the log parameters", () => {
    expect(withoutLogIntent("?d=2026-11-21&log=voice&slot=meal-1")).toEqual({ pathname: "/", search: "?d=2026-11-21" });
    expect(withoutLogIntent("?log=voice")).toEqual({ pathname: "/", search: "" });
  });

  it("moves an address at /log back to Today", () => {
    expect(withoutLogIntent("?mode=voice&slot=meal-1&d=2026-11-21", "/log")).toEqual({ pathname: "/", search: "?d=2026-11-21" });
  });
});

describe("slotOnDay", () => {
  const day = [{ slot: "meal-1" as const }, { slot: "meal-2" as const }];

  it("keeps a slot the day's layout has", () => {
    expect(slotOnDay("meal-2", day)).toBe("meal-2");
  });

  it("drops a slot the day does not have (a rest day with fewer meals)", () => {
    expect(slotOnDay("meal-6", day)).toBeNull();
    expect(slotOnDay(null, day)).toBeNull();
  });
});

describe("resolveLogIntent", () => {
  const all = { methods: ["text", "voice", "label", "photo"] as const, scan: true };

  it("opens the named capture when its method is on", () => {
    expect(resolveLogIntent("voice", all)).toEqual({ kind: "capture", method: "voice" });
    expect(resolveLogIntent("photo", all)).toEqual({ kind: "capture", method: "photo" });
    expect(resolveLogIntent("label", all)).toEqual({ kind: "capture", method: "label" });
    expect(resolveLogIntent("text", all)).toEqual({ kind: "capture", method: "text" });
    expect(resolveLogIntent("barcode", all)).toEqual({ kind: "scan" });
  });

  it("falls back from voice to text, the box that carries the dictation mic", () => {
    expect(resolveLogIntent("voice", { methods: ["text"], scan: false })).toEqual({ kind: "capture", method: "text" });
  });

  it("opens the log sheet when the method or the scanner is off", () => {
    expect(resolveLogIntent("voice", { methods: [], scan: false })).toEqual({ kind: "sheet" });
    expect(resolveLogIntent("photo", { methods: ["text"], scan: true })).toEqual({ kind: "sheet" });
    expect(resolveLogIntent("barcode", { methods: ["text"], scan: false })).toEqual({ kind: "sheet" });
    expect(resolveLogIntent(null, all)).toEqual({ kind: "sheet" });
  });
});
