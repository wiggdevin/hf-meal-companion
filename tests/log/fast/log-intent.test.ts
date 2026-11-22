/**
 * Fast logging (2026-11-21): a `/log` link opens the right capture straight away.
 *
 * `/log?mode=…&slot=…` (manifest shortcuts, the share target) redirects to Today as `/?log=…`.
 * Today reads that once, removes it from the address bar, and opens the capture. A method that is
 * switched off falls back to something that is on, never to a dead sheet.
 */
import { describe, expect, it } from "vitest";
import { logRedirectPath, parseLogIntent, resolveLogIntent, withoutLogIntent } from "@/lib/log/log-intent";

describe("logRedirectPath (the /log route)", () => {
  it("sends a known mode and slot to Today", () => {
    expect(logRedirectPath({ mode: "voice", slot: "meal-2" })).toBe("/?log=voice&slot=meal-2");
  });

  it("drops an unknown mode or slot instead of passing it on", () => {
    expect(logRedirectPath({ mode: "fax", slot: "lunch" })).toBe("/?log=open");
    expect(logRedirectPath({ mode: "photo", slot: "<script>" })).toBe("/?log=photo");
  });

  it("keeps the shared flag for a photo only", () => {
    expect(logRedirectPath({ mode: "photo", shared: "1" })).toBe("/?log=photo&shared=1");
    expect(logRedirectPath({ mode: "voice", shared: "1" })).toBe("/?log=voice");
  });

  it("reads the first value of a repeated parameter", () => {
    expect(logRedirectPath({ mode: ["barcode", "text"] })).toBe("/?log=barcode");
  });
});

describe("parseLogIntent (Today)", () => {
  it("reads the mode, the slot and the shared flag", () => {
    expect(parseLogIntent("?log=photo&slot=meal-3&shared=1"))
      .toEqual({ mode: "photo", slot: "meal-3", shared: true });
  });

  it("is null when the address carries no log request", () => {
    expect(parseLogIntent("?d=2026-11-21")).toBeNull();
    expect(parseLogIntent("")).toBeNull();
  });

  it("opens the log sheet for an unknown or bare mode", () => {
    expect(parseLogIntent("?log=open")).toEqual({ mode: null, slot: null, shared: false });
    expect(parseLogIntent("?log=nonsense&slot=nope")).toEqual({ mode: null, slot: null, shared: false });
  });
});

describe("withoutLogIntent", () => {
  it("removes only the log parameters", () => {
    expect(withoutLogIntent("?d=2026-11-21&log=voice&slot=meal-1&shared=1")).toBe("?d=2026-11-21");
    expect(withoutLogIntent("?log=voice")).toBe("");
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
