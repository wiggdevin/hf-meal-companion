/**
 * Weak spot #9: model ids are code pins (lib/ai/lanes.ts), never env vars. Retired env names in
 * `.env.example`, or a doc that names a slug the code no longer pins, lead an operator to the
 * wrong running model (the readiness note read a stale COACH_MODEL_ID and concluded 2.5 Flash).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPENROUTER_PINS } from "@/lib/ai/lanes";

const RETIRED = ["COACH_MODEL_ID", "COACH_OPENROUTER_FALLBACK_MODEL", "VOICE_ENABLED", "NOUS_API_KEY",
  "NOUS_BASE_URL", "NOUS_COACH_MODEL_ID", "NOUS_REVIEW_MODEL_ID", "NOUS_RETENTION_CONFIRMED"];

describe("AI env names and documented pins", () => {
  it(".env.example lists no AI env var the code never reads", () => {
    const names = readFileSync(".env.example", "utf8").split("\n")
      .map((line) => /^#?\s*([A-Z][A-Z0-9_]+)=/.exec(line)?.[1])
      .filter((name): name is string => !!name);
    expect(names.filter((name) => RETIRED.includes(name) || name.startsWith("NOUS_"))).toEqual([]);
  });

  it("docs/ai-data-handling.md names the coach and capture OpenRouter pins the code uses", () => {
    const doc = readFileSync("docs/ai-data-handling.md", "utf8").replace(/\s+/g, " ");
    const coach = /routes the coach's PRIMARY turn there, with the pinned `([^`]+)` slug/.exec(doc)?.[1];
    const capture = /Model: `([^`]+)`, pinned in `lib\/ai\/lanes\.ts`/.exec(doc)?.[1];
    expect(coach).toBe(OPENROUTER_PINS.coach);
    expect(capture).toBe(OPENROUTER_PINS.capture);
    expect(doc).toContain("Model ids are code pins, not env vars");
  });
});
