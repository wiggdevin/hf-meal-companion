/**
 * Fast logging (2026-11-21), F-108: a dock capture is logged at the moment it was captured, in the
 * user's zone — not at a made-up 12:00 on the draft's date.
 */
import { describe, expect, it } from "vitest";
import { draftEatenAt, stampCapture } from "@/lib/capture/draft-eaten-at";

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

  it("keeps both passes of a DST fold apart: 01:30 EDT and 01:30 EST are different instants", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const first = draftEatenAt({ localDate: "2026-11-01", capturedAt: "2026-11-01T01:30:00-04:00" }, TZ, now);
    const second = draftEatenAt({ localDate: "2026-11-01", capturedAt: "2026-11-01T01:30:00-05:00" }, TZ, now);
    expect(first?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(second?.toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });

  it("reads the capture in its own zone after the phone moves to a new zone", () => {
    // 23:30 in Denver on 21 Nov (06:30 UTC on 22 Nov) is already 22 Nov in New York.
    const block = { localDate: "2026-11-21", capturedAt: "2026-11-22T06:30:00.000Z", capturedTz: "America/Denver" };
    expect(draftEatenAt(block, TZ, new Date("2026-11-22T15:00:00Z"))?.toISOString())
      .toBe("2026-11-22T06:30:00.000Z");
  });

  it("gives a legacy card its message's saved time before now or noon", () => {
    const now = new Date("2026-11-23T15:00:00Z");
    expect(draftEatenAt({ localDate: "2026-11-21" }, TZ, now, "2026-11-21T23:15:00.000Z")?.toISOString())
      .toBe("2026-11-21T23:15:00.000Z");
    // A saved time on another date does not count; an old day with nothing better is midday.
    expect(draftEatenAt({ localDate: "2026-11-21" }, TZ, now, "1970-01-01T00:00:00.000Z")?.toISOString())
      .toBe("2026-11-21T17:00:00.000Z");
  });
});

describe("stampCapture", () => {
  const NOW = Date.parse("2026-11-22T05:00:00Z"); // 00:00 on 22 Nov in New York

  it("keeps the phone's instant across midnight UTC, in the phone's zone", () => {
    expect(stampCapture({ localDate: "2026-11-21", tz: TZ }, "2026-11-21T23:50:00-05:00", "UTC", NOW))
      .toEqual({ capturedAt: "2026-11-22T04:50:00.000Z", capturedTz: TZ });
  });

  it("falls back to the server clock for a future or off-date phone time", () => {
    expect(stampCapture({ localDate: "2026-11-22", tz: TZ }, "2026-11-22T09:00:00Z", "UTC", NOW))
      .toEqual({ capturedAt: "2026-11-22T05:00:00.000Z", capturedTz: TZ });
    expect(stampCapture({ localDate: "2026-11-22", tz: TZ }, "2026-11-20T12:00:00Z", "UTC", NOW))
      .toEqual({ capturedAt: "2026-11-22T05:00:00.000Z", capturedTz: TZ });
  });

  it("stamps the zone alone when neither clock is on the capture's date", () => {
    expect(stampCapture({ localDate: "2026-11-19" }, undefined, TZ, NOW)).toEqual({ capturedTz: TZ });
  });

  it("ignores an unknown zone from the phone and uses the account's", () => {
    expect(stampCapture({ localDate: "2026-11-22", tz: "Not/AZone" }, undefined, TZ, NOW))
      .toEqual({ capturedAt: "2026-11-22T05:00:00.000Z", capturedTz: TZ });
  });
});

describe("logDraftBlockV1Schema capture time", () => {
  it("accepts a capture time with an offset and a zone", async () => {
    const { logDraftBlockV1Schema } = await import("@/lib/coach/ui-blocks");
    const shape = logDraftBlockV1Schema.shape;
    expect(shape.capturedAt.safeParse("2026-11-01T01:30:00-05:00").success).toBe(true);
    expect(shape.capturedAt.safeParse("2026-11-01T06:30:00.000Z").success).toBe(true);
    expect(shape.capturedAt.safeParse("yesterday").success).toBe(false);
    expect(shape.capturedTz.safeParse("America/Denver").success).toBe(true);
  });
});
