/**
 * F-108 verify round (Neon BLOCK): the coach route's server code must never import a "use client"
 * module. In the production server bundle such a module is a client-reference stub, so
 * `stampCapture` calling `dateInZone` from lib/coach/apply-shared.ts would throw on every dock
 * capture. This walks the static import graph inside the repo and imports the server module itself.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^"']*?\sfrom\s+)?["']([^"']+)["']/gm;
const LEADING_COMMENTS = /^(?:\s*\/\/.*\n|\s*\/\*[\s\S]*?\*\/)*/;

function resolveSpec(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2))
    : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null;
}

function clientModulesReached(entry: string): string[] {
  const seen = new Set<string>();
  const client: string[] = [];
  const stack = [join(ROOT, entry)];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    if (/^\s*["']use client["']/.test(src.replace(LEADING_COMMENTS, ""))) {
      client.push(file.slice(ROOT.length + 1));
      continue;
    }
    for (const m of src.matchAll(IMPORT)) {
      const next = resolveSpec(m[1], file);
      if (next) stack.push(next);
    }
  }
  return client;
}

describe("the coach route's capture stamp stays server code", () => {
  it("reaches the zone clock through no \"use client\" module", () => {
    expect(clientModulesReached("lib/server/coach-attachments.ts")).not.toContain("lib/coach/apply-shared.ts");
    expect(clientModulesReached("lib/capture/draft-eaten-at.ts")).toEqual([]);
    expect(clientModulesReached("lib/zoned-time.ts")).toEqual([]);
  });

  it("stamps a capture from the server module's own import of the clock", async () => {
    const { stampCapture } = await import("@/lib/capture/draft-eaten-at");
    const now = Date.parse("2026-11-21T20:00:00Z");
    expect(stampCapture({ localDate: "2026-11-21", tz: "America/Los_Angeles" }, "2026-11-21T19:30:00Z",
      "UTC", now)).toEqual({ capturedAt: "2026-11-21T19:30:00.000Z", capturedTz: "America/Los_Angeles" });
  });
});
