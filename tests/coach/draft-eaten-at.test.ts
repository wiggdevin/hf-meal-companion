/**
 * Fast logging (2026-11-21), F-108: a dock capture is logged at the moment it was captured, in the
 * user's zone — not at a made-up 12:00 on the draft's date.
 */
import { describe, expect, it } from "vitest";
import { draftEatenAt } from "@/lib/capture/draft-eaten-at";

const TZ = "America/New_York";

describe("draftEatenAt", () => {
  it("uses the capture instant when it falls on the draft's local date", () => {
    const at = draftEatenAt({ localDate: "2026-11-21", capturedAt: "2026-11-21T23:10:00.000Z" }, TZ,
      new Date("2026-11-22T01:00:00Z"));
    expect(at?.toISOString()).toBe("2026-11-21T23:10:00.000Z");
  });

  it("keeps a 23:30 local capture on its own local date (UTC is already the next day)", () => {
    // 23:30 in New York on 21 Nov is 04:30 UTC on 22 Nov.
    const at = draftEatenAt({ localDate: "2026-11-21", capturedAt: "2026-11-22T04:30:00.000Z" }, TZ,
      new Date("2026-11-22T05:00:00Z"));
    expect(at?.toISOString()).toBe("2026-11-22T04:30:00.000Z");
  });

  it("uses the capture instant across a DST change", () => {
    // 2026-11-01 01:30 EST (second pass, after fall-back) is 06:30 UTC.
    const at = draftEatenAt({ localDate: "2026-11-01", capturedAt: "2026-11-01T06:30:00.000Z" }, TZ,
      new Date("2026-11-01T07:00:00Z"));
    expect(at?.toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });

  it("uses now for a draft with no capture time when it is still that day", () => {
    const now = new Date("2026-11-21T18:42:00Z");
    expect(draftEatenAt({ localDate: "2026-11-21" }, TZ, now)?.toISOString()).toBe(now.toISOString());
  });

  it("falls back to midday on the draft's date for an old draft with no capture time", () => {
    const at = draftEatenAt({ localDate: "2026-11-19" }, TZ, new Date("2026-11-21T18:00:00Z"));
    expect(at?.toISOString()).toBe("2026-11-19T17:00:00.000Z");
  });

  it("ignores a capture time that is not on the draft's date, or is unreadable", () => {
    const now = new Date("2026-11-21T18:42:00Z");
    expect(draftEatenAt({ localDate: "2026-11-21", capturedAt: "2026-11-19T12:00:00.000Z" }, TZ, now)
      ?.toISOString()).toBe(now.toISOString());
    expect(draftEatenAt({ localDate: "2026-11-21", capturedAt: "not a time" }, TZ, now)
      ?.toISOString()).toBe(now.toISOString());
  });

  it("answers null for an unknown zone", () => {
    expect(draftEatenAt({ localDate: "2026-11-21" }, "Not/AZone", new Date())).toBeNull();
  });
});
