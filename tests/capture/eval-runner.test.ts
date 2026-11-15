import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderReport } from "@/scripts/ai-eval";
import { scoreCases } from "@/scripts/eval/capture-score";

describe("capture evaluation inventory", () => {
  it("renders a missing photo method as unmeasured with its independent counts", () => {
    const report = renderReport([scoreCases("photo", [{ method: "photo", status: "media_missing",
      expected: [], predictions: [], mediaPresent: false }])], "2026-11-14");
    expect(report).toContain("| photo | 1 | 0 | 1 | 0 | 1 | 0 | 0 | 0 |");
    expect(report).toContain("not measured");
    expect(report).toContain("route unknown");
    expect(report).toContain("Commit SHA");
    expect(report).toContain("Prompt hash");
    expect(report).toContain("Schema hash");
    expect(report).toContain("Catalog snapshot");
  });

  it("runs the real dry-run CLI offline, including old JSONL without canonical IDs", () => {
    const directory = mkdtempSync(join(tmpdir(), "capture-eval-"));
    try {
      const corpus = join(directory, "capture.jsonl");
      const out = join(directory, "report.md");
      writeFileSync(corpus, [
        { method: "text", slot: "meal-1", localDate: "2026-11-14", text: "egg",
          expect: [{ label: "egg", grams: 100 }] },
        { method: "photo", slot: "meal-1", localDate: "2026-11-14",
          media: join(directory, "missing.jpg"), expect: [] },
      ].map((item) => JSON.stringify(item)).join("\n"));
      const execution = spawnSync(process.execPath, ["--import", "tsx", "scripts/ai-eval.ts",
        "--dry-run", "--set", corpus, "--out", out], {
        cwd: process.cwd(), encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" }, timeout: 15_000,
      });
      expect(execution.status, execution.stderr).toBe(0);
      const report = readFileSync(out, "utf8");
      expect(report).toContain("offline inventory");
      for (const method of ["text", "photo", "voice", "label"]) expect(report).toContain(`| ${method} |`);
      expect(report).toContain("| photo | 1 | 0 | 1 | 0 | 1 | 0 | 0 | 0 |");
      const manifest = JSON.parse(readFileSync(`${out}.json`, "utf8"));
      expect(manifest.execution).toBe("offline_inventory");
      expect(manifest.dataset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.cases).toHaveLength(2);
      expect(manifest.cases[0].status).toBe("not_run");
      expect(manifest.cases[1].status).toBe("media_missing");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
